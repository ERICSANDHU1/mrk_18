import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <div className="auth-rise mb-5 text-center" style={{ animationDelay: "0.06s" }}>
        <h2 className="font-display text-[28px] leading-tight tracking-[-0.01em] text-ink">
          Welcome back.
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Sign in — your CMO picks up right where you left off.
        </p>
      </div>
      <div className="auth-rise w-full" style={{ animationDelay: "0.16s" }}>
        {/* always land in Chat after signing in — the founder's home base */}
        <SignIn forceRedirectUrl="/chat" />
      </div>
    </>
  );
}
