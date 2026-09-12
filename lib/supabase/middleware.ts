import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROFILING, clock, profiledFetch, record, timed } from "@/lib/perf";

export async function updateSession(request: NextRequest) {
  if (!PROFILING) return updateSessionInner(request);
  const start = clock();
  const response = await updateSessionInner(request);
  record("proxy", request.nextUrl.pathname, start, {
    path: request.nextUrl.pathname,
    status: response.status,
  });
  return response;
}

async function updateSessionInner(request: NextRequest) {
  // The Shortcuts API authenticates itself with its own bearer token (see
  // app/api/shortcuts/transaction/route.ts) instead of a browser session —
  // that's the whole point, so a Shortcut can log a transaction without
  // ever signing in. Without this exemption every request got redirected to
  // /login (a 307 with an HTML body) before it ever reached the route.
  if (request.nextUrl.pathname.startsWith("/api/shortcuts/")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      ...(PROFILING ? { global: { fetch: profiledFetch } } : {}),
    },
  );

  // getClaims() verifies the session JWT's signature locally against the
  // project's asymmetric (ES256) signing key — the JWKS is fetched once and
  // cached process-wide by the auth client — instead of getUser(), which
  // round-trips to the Auth server on every single request. This middleware
  // runs on every page load, navigation, and server action, so that one
  // network hop was a fixed ~100–500ms tax on everything. Still a real
  // signature check (not the unverified getSession()), and it falls back
  // to getUser() automatically if the key were ever symmetric. Reading the
  // session here also still triggers the token refresh this middleware is
  // responsible for, via the cookie adapters above.
  const { data } = await timed("auth", "getClaims", () => supabase.auth.getClaims(), {
    path: request.nextUrl.pathname,
  });
  const user = data?.claims ?? null;

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/callback");

  if (!user && !isLoginPage && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Disabled: this sent every phone visit to / straight to /add instead of
  // the dashboard, and /add was crashing with a server error for real
  // mobile users in production right after this shipped. Mobile now lands
  // on the same Overview dashboard as desktop (the previously-working
  // behavior) until the crash on /add is root-caused — re-enable once
  // that's fixed and verified.
  //
  // const isMobileUserAgent = /Mobi|Android|iPhone|iPod/i.test(
  //   request.headers.get("user-agent") ?? "",
  // );
  // if (user && request.nextUrl.pathname === "/" && isMobileUserAgent) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/add";
  //   return NextResponse.redirect(url);
  // }

  return supabaseResponse;
}
