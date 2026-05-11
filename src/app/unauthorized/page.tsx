import { ShieldAlert } from "lucide-react";
import { UnauthorizedActions } from "./UnauthorizedActions";

function ForbiddenIllustration() {
  return (
    <div className="relative mx-auto aspect-[1.25/1] w-full max-w-[320px] sm:max-w-[420px] md:max-w-[390px] lg:max-w-[520px]">
      <style>{`
        @keyframes sway { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
        @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.15); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .grass-grp { transform-origin: 185px 345px; animation: sway 3.5s ease-in-out infinite; }
        .door-grp { transform-origin: 250px 220px; animation: float 4.5s ease-in-out infinite; }
        .eye-grp { transform-origin: center; animation: blink 5s ease-in-out infinite; }
      `}</style>
      <svg
        viewBox="0 0 500 380" xmlns="http://www.w3.org/2000/svg" className="h-full w-full" aria-hidden="true"
      >
        {/* พื้น */}
        <line x1="40" y1="345" x2="460" y2="345" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
        {/* หญ้าโยกตามลม */}
        <g className="grass-grp -translate-x-[-10px]">
          <path d="M 178 345 Q 176 325 179 308" stroke="#a7f3d0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M 185 345 Q 187 320 184 300" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M 192 345 Q 195 328 199 315" stroke="#a7f3d0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>

        {/* ตัวประตู (ลอยขึ้น-ลงเบาๆ) */}
     <g className="door-grp">
  {/* เงาประตูด้านหลัง: (390->385, 320->315, 250->245) */}
  <path
    d="M 385 345 L 385 175 Q 385 100 315 100 Q 245 100 245 175 L 245 345 Z"
    fill="#7c3aed"
  />
  {/* ตัวประตูหลัก: (375->370, 305->300, 235->230) */}
  <path
    d="M 370 345 L 370 175 Q 370 100 300 100 Q 230 100 230 175 L 230 345 Z"
    fill="#1f0a35"
  />
  {/* ดวงตา: (277->272, 285->280, 293->288) และ (317->312, 325->320, 333->328) */}
  <g className="eye-grp">
    <path
      d="M 272 198 Q 280 202 288 198"
      stroke="#f5f3ff"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
      opacity="0.9"
    />
    <path
      d="M 312 198 Q 320 202 328 198"
      stroke="#f5f3ff"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
      opacity="0.9"
    />
  </g>
</g>

        {/* เสาซ้าย */}

        <rect
          x="215"
          y="240"
          width="6"
          height="105"
          rx="2"
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="0.6"
        />
        <rect x="210" y="238" width="16" height="4" rx="1" fill="#cbd5e1" />

        {/* เสาขวา */}
        <rect
          x="397"
          y="240"
          width="6"
          height="105"
          rx="2"
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="0.6"
        />
        <rect x="392" y="238" width="16" height="4" rx="1" fill="#cbd5e1" />

        {/* แถบเตือน NO ENTRY */}
        <g>
          <rect
            x="204"
            y="245"
            width="210"
            height="26"
            fill="#fde68a"
            stroke="#f59e0b"
            strokeWidth="1"
          />
          <line
            x1="204"
            y1="247"
            x2="320"
            y2="247"
            stroke="#fbbf24"
            strokeWidth="0.8"
            opacity="0.6"
          />
          <line
            x1="204"
            y1="269"
            x2="320"
            y2="269"
            stroke="#d97706"
            strokeWidth="0.8"
            opacity="0.4"
          />
          <text
            x="210"
            y="263"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="10"
            fontWeight="900"
            fill="#78350f"
            letterSpacing="0.4"
          >
            NO ENTRY
          </text>
          <text
            x="280"
            y="263"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="10"
            fontWeight="900"
            fill="#78350f"
            letterSpacing="0.4"
          >
            NO ENTRY
          </text>
          <text
            x="353"
            y="263"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="10"
            fontWeight="900"
            fill="#78350f"
            letterSpacing="0.4"
          >
            NO ENTRY
          </text>
        </g>

        {/* เงาใต้ประตู */}
        <ellipse
          cx="310"
          cy="350"
          rx="85"
          ry="3"
          fill="#1f0a35"
          opacity="0.12"
        />
      </svg>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-svh items-center bg-[hsl(var(--background))] px-5 py-8 text-[hsl(var(--foreground))] sm:px-8 sm:py-10 lg:px-12">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 sm:gap-10 md:grid-cols-[minmax(260px,0.82fr)_minmax(320px,1.18fr)] md:gap-8 lg:gap-12">
        <div className="mx-auto w-full max-w-md text-center md:max-w-sm md:text-left lg:max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[hsl(var(--primary))] sm:mb-5">
            <ShieldAlert className="h-4 w-4" />
            Access control
          </div>

          <h1 className="text-[5.5rem] font-black leading-none tracking-normal text-zinc-800 dark:text-zinc-400 sm:text-[7rem] md:text-[6.5rem] lg:text-9xl">
            403
          </h1>
          <h2 className="mt-3 text-2xl font-bold tracking-normal text-zinc-700 dark:text-zinc-500 sm:text-3xl md:text-2xl lg:text-3xl">
            Access forbidden
          </h2>
          <p className="mx-auto mt-4 max-w-[34rem] text-sm leading-7 text-[hsl(var(--muted-foreground))] sm:mt-5 sm:text-base md:mx-0 lg:text-lg">
               This Email is not authorized to access the system. Please contact the admin to request access.

        
          </p>

          <UnauthorizedActions />
        </div>

        <ForbiddenIllustration />
      </section>
    </main>
  );
}
