'use client';

/**
 * UazapiConfig
 *
 * Settings panel for the unofficial WhatsApp integration via uazapi.com.
 *
 * Sections:
 *   1. Credentials form — instance URL + token (saved encrypted server-side)
 *   2. Connection status badge
 *   3. Connect / QR Code flow
 *   4. Disconnect button
 *
 * All token handling is server-side; the browser never sees the plain token.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  PlugZap,
  Power,
  Save,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SettingsPanelHead } from './settings-panel-head';
import { UazapiQrDisplay } from './uazapi-qr-display';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const STATUS_POLL_INTERVAL_MS = 3_000;
const MASKED_TOKEN = '••••••••••••••••';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />
        Conectado
      </Badge>
    );
  }
  if (status === 'connecting') {
    return (
      <Badge className="gap-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
        <Clock className="h-3 w-3 animate-pulse" />
        Aguardando escaneamento…
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <WifiOff className="h-3 w-3" />
      Desconectado
    </Badge>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UazapiConfig() {
  const { accountId } = useAuth();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [instanceUrl, setInstanceUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [instanceToken, setInstanceToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [hasExistingConfig, setHasExistingConfig] = useState(false);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [refreshingQr, setRefreshingQr] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  // ── Load existing config ───────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/uazapi/config');
      if (!res.ok) return;
      const { config } = await res.json();
      if (config) {
        setInstanceUrl(config.instance_url ?? '');
        setInstanceName(config.instance_name ?? '');
        setInstanceToken(MASKED_TOKEN);
        setHasExistingConfig(true);
        setStatus(config.status ?? 'disconnected');
        setPhoneNumber(config.phone_number ?? undefined);
      }
    } catch (err) {
      console.error('Failed to load uazapi config:', err);
    } finally {
      if (isMounted.current) setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    loadConfig();
    return () => {
      isMounted.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // ── Status polling ────────────────────────────────────────────────────────

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/uazapi/status');
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      const newStatus: ConnectionStatus = data.status ?? 'disconnected';
      setStatus(newStatus);
      if (data.phone) setPhoneNumber(data.phone);
      if (newStatus === 'connected') {
        stopPolling();
        setQrCode(null);
      }
    } catch {
      // network blip — keep polling
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS);
  }, [pollStatus]);

  // Start polling automatically when status is 'connecting'
  useEffect(() => {
    if (status === 'connecting') {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [status, startPolling]);

  // ── Save credentials ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!instanceUrl.trim()) {
      toast.error('Informe a URL da instância');
      return;
    }
    if (!instanceName.trim()) {
      toast.error('Informe o Nome da Instância (Session)');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = { 
        instance_url: instanceUrl.trim(),
        instance_name: instanceName.trim(),
      };
      if (instanceToken && instanceToken !== MASKED_TOKEN) {
        body.instance_token = instanceToken.trim();
      }

      const res = await fetch('/api/uazapi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao salvar configuração');
        return;
      }

      setHasExistingConfig(true);
      setInstanceToken(MASKED_TOKEN);
      toast.success('Configuração salva com sucesso');
    } catch {
      toast.error('Erro de rede ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  // ── Fetch QR Code ─────────────────────────────────────────────────────────

  const fetchQrCode = useCallback(async () => {
    setRefreshingQr(true);
    try {
      const res = await fetch('/api/uazapi/qrcode');
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao obter QR Code');
        return;
      }

      if (data.status === 'connected') {
        setStatus('connected');
        setQrCode(null);
        if (data.phone) setPhoneNumber(data.phone);
        return;
      }

      setQrCode(data.qrcode ?? null);
      setStatus('connecting');
    } catch {
      toast.error('Erro de rede ao obter QR Code');
    } finally {
      setRefreshingQr(false);
    }
  }, []);

  const handleConnect = async () => {
    if (!hasExistingConfig) {
      toast.error('Salve a configuração antes de conectar');
      return;
    }
    setConnecting(true);
    await fetchQrCode();
    setConnecting(false);
  };

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    setDisconnecting(true);
    stopPolling();
    try {
      const res = await fetch('/api/uazapi/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Falha ao desconectar');
        return;
      }
      setStatus('disconnected');
      setQrCode(null);
      setPhoneNumber(undefined);
      toast.success('WhatsApp desconectado');
    } catch {
      toast.error('Erro de rede ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingConfig) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="WhatsApp Não Oficial"
        description="Conecte seu número de WhatsApp via API não oficial (uazapi). Não requer aprovação da Meta — basta escanear o QR Code."
      />

      {/* Risk warning */}
      <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Atenção — API não oficial</AlertTitle>
        <AlertDescription>
          Esta integração usa a API não oficial do WhatsApp. O número pode ser banido pela Meta caso
          o uso seja detectado. Use por sua conta e risco, preferencialmente com WhatsApp Business.
        </AlertDescription>
      </Alert>

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Credenciais da Instância</CardTitle>
              <CardDescription className="mt-1">
                Configure sua instância do{' '}
                <a
                  href="https://uazapi.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  uazapi.com
                  <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instance URL */}
          <div className="space-y-1.5">
            <Label htmlFor="uazapi-url">URL da Instância</Label>
            <Input
              id="uazapi-url"
              type="url"
              placeholder="https://minha-instancia.uazapi.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              disabled={saving || connecting}
            />
            <p className="text-xs text-muted-foreground">
              URL base da sua instância uazapi (sem barra no final)
            </p>
          </div>

          {/* Instance Name */}
          <div className="space-y-1.5">
            <Label htmlFor="uazapi-name">Nome da Instância (Session)</Label>
            <Input
              id="uazapi-name"
              type="text"
              placeholder="Ex: empresa1"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              disabled={saving || connecting}
            />
            <p className="text-xs text-muted-foreground">
              Identificador único da sua sessão no uazapi
            </p>
          </div>

          {/* Instance Token */}
          <div className="space-y-1.5">
            <Label htmlFor="uazapi-token">Token de Autenticação</Label>
            <div className="relative">
              <Input
                id="uazapi-token"
                type={showToken ? 'text' : 'password'}
                placeholder="Cole o token da sua instância"
                value={instanceToken}
                onChange={(e) => setInstanceToken(e.target.value)}
                disabled={saving || connecting}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {hasExistingConfig && (
              <p className="text-xs text-muted-foreground">
                Token salvo e criptografado. Para alterar, insira um novo token.
              </p>
            )}
          </div>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving || connecting || !instanceUrl.trim() || !instanceName.trim()}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Salvando…' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>

      {/* Connection Card */}
      {hasExistingConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conexão</CardTitle>
            <CardDescription>
              {status === 'connected'
                ? 'Seu WhatsApp está conectado e pronto para uso.'
                : status === 'connecting'
                ? 'Escaneie o QR Code com seu celular para conectar.'
                : 'Clique em "Conectar" para iniciar a sessão WhatsApp.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR Display Modal — shown when connecting */}
            <Dialog 
              open={status === 'connecting' || !!qrCode} 
              onOpenChange={(open) => {
                if (!open && status !== 'connected') {
                  setStatus('disconnected');
                  setQrCode(null);
                  stopPolling();
                }
              }}
            >
              <DialogContent className="sm:max-w-lg w-11/12 max-h-[90vh] overflow-y-auto flex flex-col items-center p-6 bg-card border-border">
                <DialogHeader className="w-full sm:text-center mb-4">
                  <DialogTitle className="text-center">Conectar WhatsApp</DialogTitle>
                </DialogHeader>
                {(status === 'connecting' || qrCode) && (
                  <UazapiQrDisplay
                    qrcode={qrCode}
                    onRefresh={fetchQrCode}
                    refreshing={refreshingQr}
                    connected={status === 'connected'}
                    phoneNumber={phoneNumber}
                    expiresIn={30}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Connected state */}
            {status === 'connected' && !qrCode && (
              <UazapiQrDisplay
                qrcode={null}
                onRefresh={fetchQrCode}
                refreshing={false}
                connected
                phoneNumber={phoneNumber}
              />
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-4">
              {status !== 'connected' && (
                <Button
                  onClick={handleConnect}
                  disabled={connecting || refreshingQr || disconnecting}
                  className="gap-2"
                >
                  {connecting || refreshingQr ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  {status === 'connecting' ? 'Atualizar QR Code' : 'Conectar'}
                </Button>
              )}

              {(status === 'connected' || status === 'connecting') && (
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  {disconnecting ? 'Desconectando…' : 'Desconectar'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
