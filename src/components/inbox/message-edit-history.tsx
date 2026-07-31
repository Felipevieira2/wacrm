"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { History, Pencil, Clock } from "lucide-react";
import { format } from "date-fns";
import type { MessageEdit } from "@/types";

interface MessageEditHistoryModalProps {
  messageId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MessageEditHistoryModal({
  messageId,
  isOpen,
  onClose,
}: MessageEditHistoryModalProps) {
  const [edits, setEdits] = useState<MessageEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !messageId) return;

    let isMounted = true;

    async function loadEdits() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error: fetchErr } = await supabase
          .from("message_edits")
          .select("*")
          .eq("message_id", messageId)
          .order("edited_at", { ascending: false });

        if (!isMounted) return;
        if (fetchErr) {
          console.error("[MessageEditHistoryModal] Error fetching edits:", fetchErr);
          setError("Não foi possível carregar o histórico de edições.");
        } else {
          setEdits((data as MessageEdit[]) || []);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("[MessageEditHistoryModal] Error:", err);
        setError("Erro ao carregar histórico.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadEdits();

    return () => {
      isMounted = false;
    };
  }, [isOpen, messageId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-primary" />
            Histórico de Edições
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Versões anteriores desta mensagem conforme editada pelo cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1 space-y-3">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
              Carregando histórico...
            </div>
          ) : error ? (
            <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : edits.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma versão anterior registrada no histórico.
            </div>
          ) : (
            edits.map((edit, index) => (
              <div
                key={edit.id || index}
                className="relative rounded-lg border border-border bg-muted/30 p-3 text-xs"
              >
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Pencil className="h-3 w-3 text-primary" />
                    Versão {edits.length - index}
                  </span>
                  <span className="flex items-center gap-1 text-[10px]">
                    <Clock className="h-3 w-3" />
                    {format(new Date(edit.edited_at), "dd/MM/yyyy HH:mm:ss")}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="rounded bg-destructive/10 p-2 text-foreground line-through opacity-80">
                    <span className="block text-[9px] font-bold uppercase text-destructive">Anterior:</span>
                    {edit.old_content_text || "(vazio)"}
                  </div>
                  <div className="rounded bg-primary/10 p-2 text-foreground font-medium">
                    <span className="block text-[9px] font-bold uppercase text-primary">Alterado para:</span>
                    {edit.new_content_text}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
