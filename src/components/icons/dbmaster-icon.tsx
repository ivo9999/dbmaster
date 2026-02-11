import { cn } from "@/lib/utils";

interface DbmasterIconProps {
  className?: string;
  size?: number;
}

export function DbmasterIcon({ className, size = 24 }: DbmasterIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
    >
      {/* Database cylinder */}
      <ellipse cx="16" cy="8" rx="10" ry="4" className="fill-primary" />
      <path
        d="M6 8v16c0 2.2 4.5 4 10 4s10-1.8 10-4V8"
        className="stroke-primary"
        strokeWidth="2"
        fill="none"
      />
      <ellipse cx="16" cy="24" rx="10" ry="4" className="fill-primary/20" />

      {/* Middle ring */}
      <path
        d="M6 16c0 2.2 4.5 4 10 4s10-1.8 10-4"
        className="stroke-primary/60"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Accent lines */}
      <path
        d="M10 11v10M16 12v11M22 11v10"
        className="stroke-primary/40"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
