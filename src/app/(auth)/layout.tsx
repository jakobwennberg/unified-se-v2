export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#141c2b_0%,_#0a0f1a_60%)]" />
      {/* Subtle accent glow */}
      <div className="absolute left-1/2 top-1/3 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.03] blur-[100px]" />
      <div className="relative z-10 w-full max-w-[400px] px-4">
        {children}
      </div>
    </div>
  );
}
