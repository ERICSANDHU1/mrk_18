import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <div className="auth-rise mb-5 text-center" style={{ animationDelay: "0.06s" }}>
        <h2 className="font-display text-[28px] leading-tight tracking-[-0.01em] text-ink">
          Meet your CMO.
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Two minutes of setup, then the truth about your marketing.
        </p>
      </div>
      <div className="auth-rise w-full" style={{ animationDelay: "0.16s" }}>
        {/* new accounts land in Chat too — one consistent home base */}
        <SignUp forceRedirectUrl="/chat" />
      </div>
    </>
  );
}
