'use client';

/**
 * UazapiQrDisplay
 *
 * WhatsApp-style QR Code scanner panel.
 * Shows the QR image with a countdown timer, instructions, and a
 * "Refresh" button when the code expires.
 *
 * Props:
 *   qrcode      — base64 image string (without data: prefix)
 *   onRefresh   — called when user clicks "Refresh QR Code"
 *   refreshing  — true while a new QR is being fetched
 *   expiresIn   — seconds until the current QR expires (default 30)
 */

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Smartphone, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface UazapiQrDisplayProps {
  qrcode: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
  expiresIn?: number; // seconds
  connected?: boolean;
  phoneNumber?: string;
}

export function UazapiQrDisplay({
  qrcode,
  onRefresh,
  refreshing = false,
  expiresIn = 30,
  connected = false,
  phoneNumber,
}: UazapiQrDisplayProps) {
  const [secondsLeft, setSecondsLeft] = useState(expiresIn);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset and restart timer whenever a new QR code arrives
  useEffect(() => {
    if (!qrcode || connected) return;

    setSecondsLeft(expiresIn);
    setExpired(false);

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setExpired(true);
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [qrcode, expiresIn, connected]);

  const progressPct = ((secondsLeft / expiresIn) * 100).toFixed(1);
  const progressColor =
    secondsLeft > 15 ? 'hsl(142, 70%, 45%)' : secondsLeft > 8 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)';

  // ── Connected state ──────────────────────────────────────────────────────
  if (connected) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-muted/30 px-8 py-10">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(142,70%,40%)]">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">WhatsApp Conectado</p>
          {phoneNumber && (
            <p className="mt-1 text-sm text-muted-foreground">
              Número: <span className="font-mono text-foreground">{phoneNumber}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Loading / no QR yet ───────────────────────────────────────────────────
  if (!qrcode && !refreshing) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-muted/30 px-8 py-10">
        <div className="h-60 w-60 animate-pulse rounded-xl bg-muted" />
        <p className="text-sm text-muted-foreground">Aguardando QR Code…</p>
      </div>
    );
  }

  // ── Main QR display ───────────────────────────────────────────────────────
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (parseFloat(progressPct) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* QR Code Card */}
      <div
        className={cn(
          'relative flex flex-col items-center gap-0 overflow-hidden rounded-2xl p-5 shadow-xl transition-all duration-300',
          'bg-[#111b21]',
          expired && 'opacity-50',
        )}
      >
        {/* WhatsApp header bar */}
        <div className="mb-4 flex items-center gap-2">
          {/* WhatsApp logo SVG */}
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#00a884]">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span className="text-sm font-medium text-[#8696a0]">Conectar via WhatsApp</span>
        </div>

        {/* QR Image container */}
        <div className="relative">
          {refreshing ? (
            <div className="flex h-60 w-60 items-center justify-center rounded-xl bg-white">
              <RefreshCw className="h-8 w-8 animate-spin text-[#00a884]" />
            </div>
          ) : (
            <img
              src={qrcode!.startsWith('data:') ? qrcode! : `data:image/png;base64,${qrcode}`}
              alt="QR Code para conectar WhatsApp"
              className="h-60 w-60 rounded-xl bg-white p-2"
              draggable={false}
            />
          )}

          {/* Expired overlay */}
          {expired && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/70">
              <RefreshCw className="h-8 w-8 text-white" />
              <p className="text-xs font-medium text-white">QR Code expirado</p>
            </div>
          )}
        </div>

        {/* Countdown ring */}
        {!expired && !refreshing && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="relative h-[120px] w-[120px]">
              <svg className="-rotate-90" viewBox="0 0 120 120">
                {/* Track */}
                <circle
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke="hsl(215, 10%, 25%)"
                  strokeWidth="8"
                />
                {/* Progress */}
                <circle
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke={progressColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-white">{secondsLeft}</span>
                <span className="text-[10px] text-[#8696a0]">segundos</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Refresh button (shown when expired) */}
      {expired && (
        <Button onClick={onRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Atualizar QR Code
        </Button>
      )}

      {/* Instructions */}
      <div className="w-full max-w-sm rounded-xl border border-border bg-muted/40 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Como conectar
        </p>
        <ol className="space-y-2">
          {[
            'Abra o WhatsApp no seu celular',
            'Toque em Mais opções ⋮ ou Configurações ⚙',
            'Selecione Aparelhos conectados',
            'Toque em Conectar um aparelho',
            'Aponte a câmera para este QR Code',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[hsl(142,70%,40%)] text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2">
          <Smartphone className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Use preferencialmente WhatsApp Business
          </p>
        </div>
      </div>
    </div>
  );
}
