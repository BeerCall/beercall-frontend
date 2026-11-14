import {useEffect, useRef, useState, type CSSProperties} from 'react';

const KEYFRAMES_ID = 'beercall-scrolling-label-keyframes';
const SCROLL_SPEED_PX_PER_SECOND = 28;
const MIN_DURATION_SECONDS = 8;

function ensureScrollKeyframes(): void {
    if (typeof document === 'undefined' || document.getElementById(KEYFRAMES_ID)) return;
    const style = document.createElement('style');
    style.id = KEYFRAMES_ID;
    style.textContent = '@keyframes beercall-card-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}';
    document.head.appendChild(style);
}

export interface ScrollingLabelProps {
    /** Texte complet. Le nom accessible reste ce texte, une seule fois. */
    text: string;
    /** Classes de typographie de la card (taille, graisse, couleur). */
    className?: string;
}

/**
 * Libellé d'une card : immobile s'il tient, défilement lent uniquement s'il
 * déborde réellement. Le défilement ne dépend pas du survol (tactile), se met
 * en pause hors visibilité et respecte `prefers-reduced-motion` : dans ce cas,
 * le texte reste lisible sans animation par un balayage horizontal manuel.
 *
 * Le libellé est rendu dans un `h3` pour conserver la sémantique des cards ;
 * la copie animée est `aria-hidden` afin de ne jamais dupliquer le nom accessible.
 */
export function ScrollingLabel({text, className = ''}: ScrollingLabelProps) {
    const hostRef = useRef<HTMLHeadingElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(false);
    // Le libellé est lisible par défaut ; l'observateur le met en pause hors écran.
    const [visible, setVisible] = useState(true);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [duration, setDuration] = useState(MIN_DURATION_SECONDS);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReducedMotion(query.matches);
        sync();
        query.addEventListener?.('change', sync);
        return () => query.removeEventListener?.('change', sync);
    }, []);

    useEffect(() => {
        const host = hostRef.current;
        const measure = measureRef.current;
        if (!host || !measure) return;
        const update = () => {
            const textWidth = measure.scrollWidth;
            const available = host.clientWidth;
            const overflows = textWidth > available + 1;
            setOverflow(overflows);
            setDuration(Math.max(MIN_DURATION_SECONDS, Math.ceil(textWidth / SCROLL_SPEED_PX_PER_SECOND)));
        };
        update();
        let cancelled = false;
        if (typeof document !== 'undefined' && document.fonts) {
            document.fonts.ready
                .then(() => {
                    if (!cancelled && host.isConnected) update();
                })
                .catch(() => undefined);
        }
        if (typeof ResizeObserver === 'undefined') {
            return () => {
                cancelled = true;
            };
        }
        let observer: ResizeObserver | null = null;
        try {
            observer = new ResizeObserver(update);
            observer.observe(host);
        } catch (error) {
            console.warn('[ScrollingLabel] ResizeObserver indisponible, mesure initiale seulement', error);
            observer = null;
        }
        return () => {
            cancelled = true;
            observer?.disconnect();
        };
    }, [text]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || typeof IntersectionObserver === 'undefined') return;
        let observer: IntersectionObserver;
        try {
            observer = new IntersectionObserver((entries) => {
                setVisible(entries.some((entry) => entry.isIntersecting));
            }, {threshold: 0.1});
            observer.observe(host);
        } catch (error) {
            console.warn('[ScrollingLabel] IntersectionObserver indisponible, défilement maintenu', error);
            return;
        }
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (overflow && !reducedMotion) ensureScrollKeyframes();
    }, [overflow, reducedMotion]);

    const animated = overflow && !reducedMotion;
    const manual = overflow && reducedMotion;
    const hostStyle: CSSProperties | undefined = manual ? {touchAction: 'pan-x'} : undefined;
    const trackStyle: CSSProperties | undefined = animated
        ? {
            animationName: 'beercall-card-scroll',
            animationDuration: `${duration}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationPlayState: visible ? 'running' : 'paused',
            willChange: 'transform',
        }
        : undefined;

    return (
        <h3
            ref={hostRef}
            data-testid="scrolling-label-host"
            data-overflow={overflow ? 'true' : 'false'}
            data-reduced={manual ? 'true' : 'false'}
            style={hostStyle}
            className={`relative block min-w-0 whitespace-nowrap ${manual ? 'overflow-x-auto hide-scrollbar' : 'overflow-hidden'} ${className}`}
        >
            <span
                ref={measureRef}
                aria-hidden="true"
                data-testid="scrolling-label-measure"
                className="pointer-events-none invisible absolute whitespace-nowrap"
            >
                {text}
            </span>
            {manual ? (
                <span className="block whitespace-nowrap" data-testid="scrolling-label-scroll">
                    {text}
                </span>
            ) : animated ? (
                <span className="inline-block whitespace-nowrap" data-testid="scrolling-label-track" style={trackStyle}>
                    <span className="inline-block pr-6">{text}</span>
                    <span className="inline-block pr-6" aria-hidden="true">{text}</span>
                </span>
            ) : (
                <span className="block whitespace-nowrap" data-testid="scrolling-label-static">{text}</span>
            )}
        </h3>
    );
}
