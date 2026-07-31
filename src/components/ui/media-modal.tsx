"use client";

import React, { useState, useCallback, useEffect, createContext, useContext } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Dialog,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  X,
  Maximize2,
  Minimize2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaType = "image" | "video" | "audio" | "document" | "auto";

export interface MediaItem {
  src: string;
  type?: MediaType;
  title?: string;
  filename?: string;
}

interface MediaModalContextType {
  openMedia: (item: MediaItem) => void;
  closeMedia: () => void;
}

const MediaModalContext = createContext<MediaModalContextType | undefined>(undefined);

/**
 * Hook para abrir mídias programaticamente de qualquer lugar da aplicação
 */
export function useMediaModal() {
  const context = useContext(MediaModalContext);
  if (!context) {
    throw new Error("useMediaModal deve ser usado dentro de um MediaModalProvider");
  }
  return context;
}

/**
 * Provedor Global de Modal de Mídia
 */
export function MediaModalProvider({ children }: { children: React.ReactNode }) {
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);

  const openMedia = useCallback((item: MediaItem) => {
    setActiveMedia(item);
  }, []);

  const closeMedia = useCallback(() => {
    setActiveMedia(null);
  }, []);

  return (
    <MediaModalContext.Provider value={{ openMedia, closeMedia }}>
      {children}
      {activeMedia && (
        <MediaModalViewer
          isOpen={Boolean(activeMedia)}
          onClose={closeMedia}
          media={activeMedia}
        />
      )}
    </MediaModalContext.Provider>
  );
}

export interface MediaModalProps {
  /** URL da mídia */
  src: string;
  /** Tipo da mídia. Se não for informado ou for 'auto', detecta pela extensão/URL */
  type?: MediaType;
  /** Título/legenda opcional exibido no cabeçalho */
  title?: string;
  /** Nome do arquivo para download */
  filename?: string;
  /** Classes CSS adicionais para o container que envolve os elementos filhos */
  className?: string;
  /** Elemento(s) que acionarão a abertura da modal ao serem clicados */
  children: React.ReactNode;
}

/**
 * Detecta o tipo de mídia pela URL caso não seja especificado
 */
function detectMediaType(url: string, explicitType?: MediaType): MediaType {
  if (explicitType && explicitType !== "auto") return explicitType;
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/i.test(cleanUrl)) return "image";
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)$/i.test(cleanUrl)) return "video";
  if (/\.(mp3|wav|ogg|aac|m4a|flac|opus)$/i.test(cleanUrl)) return "audio";
  return "image";
}

/**
 * Componente Wrapper: Envolva QUALQUER elemento para torná-lo clicável e abrir a mídia expandida
 *
 * @example
 * <MediaModal src="https://exemplo.com/foto.jpg" title="Foto do Cliente">
 *   <img src="https://exemplo.com/foto.jpg" className="w-20 h-20 rounded" />
 * </MediaModal>
 */
export function MediaModal({
  src,
  type = "auto",
  title,
  filename,
  className,
  children,
}: MediaModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const mediaType = detectMediaType(src, type);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <>
      <div
        onClick={handleOpen}
        className={cn("inline-block cursor-pointer transition-transform hover:opacity-95 active:scale-[0.99]", className)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {children}
      </div>

      {isOpen && (
        <MediaModalViewer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          media={{ src, type: mediaType, title, filename }}
        />
      )}
    </>
  );
}

interface MediaModalViewerProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaItem;
}

function MediaModalViewer({ isOpen, onClose, media }: MediaModalViewerProps) {
  const { src, type = "image", title, filename } = media;
  const mediaType = detectMediaType(src, type);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reseta zoom e rotação ao trocar a mídia ou abrir
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [src, isOpen]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "r" || e.key === "R") handleRotate();
      if (e.key === "0") handleReset();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename || title || src.split("/").pop() || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(src, "_blank");
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md transition-opacity duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex h-screen w-screen flex-col justify-between overflow-hidden bg-transparent p-0 outline-none border-none shadow-none focus:outline-none">
          <DialogTitle className="sr-only">
            {title || "Visualizador de Mídia"}
          </DialogTitle>

          {/* Barra Superior (Barra de Ferramentas / Cabeçalho) */}
          <div className="relative z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3 text-white backdrop-blur-sm sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold sm:text-base">
                  {title || filename || "Visualizador de Mídia"}
                </h3>
                <p className="text-xs text-white/70">
                  {mediaType.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Ações da Barra Superior */}
            <div className="flex items-center gap-1 sm:gap-2">
              {mediaType === "image" && (
                <>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    title="Aumentar Zoom (+)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    title="Diminuir Zoom (-)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRotate}
                    title="Rotacionar (R)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleDownload}
                title="Baixar Mídia"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => window.open(src, "_blank")}
                title="Abrir em Nova Aba"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                title="Tela Cheia"
                className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                title="Fechar (Esc)"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors ml-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Área Principal de Exibição do Conteúdo */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            {mediaType === "image" && (
              <div
                className="flex items-center justify-center transition-transform duration-200 ease-out select-none"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              >
                <img
                  src={src}
                  alt={title || "Mídia expandida"}
                  className="max-h-[82vh] max-w-[90vw] object-contain drop-shadow-2xl rounded-sm"
                  draggable={false}
                />
              </div>
            )}

            {mediaType === "video" && (
              <video
                src={src}
                controls
                autoPlay
                className="max-h-[82vh] max-w-[90vw] rounded-lg shadow-2xl outline-none"
              >
                Seu navegador não suporta a reprodução deste vídeo.
              </video>
            )}

            {mediaType === "audio" && (
              <div className="flex flex-col items-center justify-center gap-6 rounded-2xl bg-white/10 p-8 backdrop-blur-xl border border-white/10 max-w-md w-full shadow-2xl">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary animate-pulse">
                  <FileText className="h-10 w-10" />
                </div>
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white">
                    {title || "Arquivo de Áudio"}
                  </h4>
                  <p className="text-xs text-white/60 mt-1">{filename || src}</p>
                </div>
                <audio src={src} controls autoPlay className="w-full">
                  Seu navegador não suporta a reprodução deste áudio.
                </audio>
              </div>
            )}

            {mediaType === "document" && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/10 p-8 backdrop-blur-xl border border-white/10 max-w-md text-center text-white">
                <FileText className="h-16 w-16 text-primary" />
                <h4 className="text-lg font-semibold">{title || filename || "Documento"}</h4>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download className="h-4 w-4" /> Baixar Documento
                </button>
              </div>
            )}
          </div>

          {/* Rodapé Informativo (Zoom reset & Dicas de atalho) */}
          <div className="relative z-10 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-6 py-3 text-xs text-white/70 backdrop-blur-sm">
            <span>
              {mediaType === "image" && `Zoom: ${Math.round(zoom * 100)}% | Rotação: ${rotation}°`}
            </span>
            <div className="hidden sm:flex items-center gap-3 text-[11px]">
              <span><kbd className="rounded bg-white/20 px-1.5 py-0.5">Esc</kbd> Fechar</span>
              {mediaType === "image" && (
                <>
                  <span><kbd className="rounded bg-white/20 px-1.5 py-0.5">+</kbd> / <kbd className="rounded bg-white/20 px-1.5 py-0.5">-</kbd> Zoom</span>
                  <span><kbd className="rounded bg-white/20 px-1.5 py-0.5">R</kbd> Girar</span>
                  <button type="button" onClick={handleReset} className="underline hover:text-white">
                    Resetar
                  </button>
                </>
              )}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
