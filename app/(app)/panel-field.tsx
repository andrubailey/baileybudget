import { PANEL_FIELD_LABEL_CLASS, PANEL_FIELD_WRAPPER_CLASS } from "@/lib/ui";

// A label sitting above its value inside one shared bordered row — the
// "boxed field" style used by the Transaction and Account side panels
// (matches the reference design: Account type / Account name / Current
// balance each in their own bordered box with a small label on top). The
// child input/select should use PANEL_FIELD_INPUT_CLASS so it blends into
// the wrapper's own border instead of drawing a second one.
export function PanelField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={PANEL_FIELD_WRAPPER_CLASS}>
      <span className={PANEL_FIELD_LABEL_CLASS}>
        {label}
        {optional && <span className="font-normal opacity-70"> · optional</span>}
      </span>
      {children}
    </label>
  );
}
