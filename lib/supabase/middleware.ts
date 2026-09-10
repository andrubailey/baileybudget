import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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
  const { data } = await supabase.auth.getClaims();
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

  return supabaseResponse;
}
