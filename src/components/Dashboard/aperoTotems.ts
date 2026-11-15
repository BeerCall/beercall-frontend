import type {AperoStatus} from '../../types/api';

/**
 * Totems d'apéros (14e-2) : quatre objets-signatures SVG, sans fond rond et
 * **sans libellé sous l'objet**. Les informations restent dans les cartes et
 * dans le nom accessible des proxys. Les bières qui trinquent et la pinte qui
 * se remplit sont animées par une petite série d'images de carte.
 */
export type TotemVariant = 'active' | 'scheduled' | 'past' | 'group';

export interface TotemPalette {
    top: string;
    bottom: string;
    stroke: string;
    accent: string;
}

const AMBER: TotemPalette = {
    top: '#FBBF24',
    bottom: '#EA580C',
    stroke: '#9A3412',
    accent: '#F59E0B',
};
const CYAN: TotemPalette = {
    top: '#38BDF8',
    bottom: '#0284C7',
    stroke: '#0369A1',
    accent: '#00B4D8',
};
const EMPTY = {
    top: '#F1F5F9',
    bottom: '#94A3B8',
    stroke: '#475569',
    accent: '#64748B',
};

export function totemPalette(color?: string | null, ended = false): TotemPalette {
    if (ended) return EMPTY;
    return /^#(?:00B4D8|06B6D4|0EA5E9|38BDF8)$/i.test(color ?? '') ? CYAN : AMBER;
}

const STICKER = `
<defs><style>
.totem { filter: drop-shadow(0 2px 0 #FFFFFF) drop-shadow(0 -2px 0 #FFFFFF)
  drop-shadow(2px 0 0 #FFFFFF) drop-shadow(-2px 0 0 #FFFFFF)
  drop-shadow(0 7px 12px rgba(15, 23, 42, 0.35)); }
</style></defs>`;

const FONT = `font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="800" font-style="italic"`;

function wrap(width: number, height: number, body: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}"
        viewBox="0 0 ${width} ${height}">${STICKER}<g class="totem">${body}</g></svg>`;
}

export interface TotemSpec {
    key: string;
    svg: string;
    width: number;
    height: number;
}

export interface TotemAnimation {
    key: string;
    frames: TotemSpec[];
}

function keyOf(variant: TotemVariant, count: number, palette: TotemPalette): string {
    let hash = 2166136261;
    const raw = `${variant}|${count}|${palette.top}|${palette.bottom}|${palette.stroke}`;
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `apero-totem-${variant}-${(hash >>> 0).toString(36)}`;
}

const CLINK_LEFT = [-14, -7, 1, 6, 1, -7] as const;
const CLINK_RIGHT = [14, 7, -1, -6, -1, 7] as const;
const SPARK_SCALE = [0.35, 0.7, 1.2, 1.3, 0.8, 0.45] as const;
const SPARK_OPACITY = [0, 0.35, 1, 1, 0.6, 0] as const;

/** Deux chopes qui trinquent, sans libellé. */
function activeTotem(frame: number, palette: TotemPalette): string {
    const c = palette;
    const index = frame % CLINK_LEFT.length;
    return wrap(108, 72, `
<g transform="translate(6 0)">
  <g transform="translate(48 14) scale(${SPARK_SCALE[index]}) translate(-48 -14)"
     opacity="${SPARK_OPACITY[index]}">
    <path d="M48 4L50.5 11.5L58 14L50.5 16.5L48 24L45.5 16.5L38 14L45.5 11.5L48 4Z" fill="#FBBF24" stroke="#0F172A" stroke-width="2"/>
    <circle cx="34" cy="10" r="2.5" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5"/>
    <circle cx="62" cy="10" r="2.5" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5"/>
  </g>
  <g transform="rotate(${CLINK_LEFT[index]} 29 50)">
    <path d="M18 39H11C8.5 39 7 41 7 44V54C7 57 8.5 59 11 59H18" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M18 39H11C8.5 39 7 41 7 44V54C7 57 8.5 59 11 59H18" fill="none" stroke="${c.top}" stroke-width="2" stroke-linecap="round"/>
    <rect x="16" y="31" width="26" height="36" rx="6" fill="${c.top}" stroke="#0F172A" stroke-width="3.5"/>
    <rect x="20" y="37" width="4" height="22" rx="2" fill="#FFFFFF" fill-opacity="0.45"/>
    <rect x="28" y="39" width="3" height="20" rx="1.5" fill="#0F172A" fill-opacity="0.18"/>
    <path d="M13 31C13 26.5 16.5 24 20 24.5C21.5 21 26.5 20 29.5 22.5C33 20.5 38 22.5 38.5 26C41.5 26.5 44 29 43 32.5C42 35 39 35 36 35H16C14 35 13 33.5 13 31Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.2"/>
  </g>
  <g transform="rotate(${CLINK_RIGHT[index]} 67 50)">
    <path d="M78 39H85C87.5 39 89 41 89 44V54C89 57 87.5 59 85 59H78" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M78 39H85C87.5 39 89 41 89 44V54C89 57 87.5 59 85 59H78" fill="none" stroke="${c.bottom}" stroke-width="2" stroke-linecap="round"/>
    <rect x="54" y="31" width="26" height="36" rx="6" fill="${c.bottom}" stroke="#0F172A" stroke-width="3.5"/>
    <rect x="58" y="37" width="4" height="22" rx="2" fill="#FFFFFF" fill-opacity="0.45"/>
    <rect x="66" y="39" width="3" height="20" rx="1.5" fill="#0F172A" fill-opacity="0.18"/>
    <path d="M53 31C53 26.5 56.5 24 60 24.5C61.5 21 66.5 20 69.5 22.5C73 20.5 78 22.5 78.5 26C81.5 26.5 84 29 83 32.5C82 35 79 35 76 35H56C54 35 53 33.5 53 31Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="3.2"/>
  </g>
</g>
`);
}

const LIQUID_TOP = [42, 38, 34, 31, 34, 38] as const;
const BUBBLE_Y = [58, 54, 50, 47, 51, 55] as const;

/** Pinte transparente en remplissage, sans libellé. */
function scheduledTotem(frame: number, palette: TotemPalette): string {
    const c = palette;
    const index = frame % LIQUID_TOP.length;
    const top = LIQUID_TOP[index];
    return wrap(92, 74, `
<g transform="translate(8 0)">
  <rect x="29" y="3" width="8" height="9" rx="2" fill="#0F172A" stroke="#FFFFFF" stroke-width="1.5"/>
  <line x1="33" y1="12" x2="33" y2="${top + 6}" stroke="${c.top}" stroke-width="4" stroke-linecap="round" stroke-dasharray="6 3"/>
  <path d="M50 30H59C62.5 30 65 32.5 65 36V52C65 55.5 62.5 58 59 58H50" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="16" y="20" width="34" height="50" rx="7" fill="#E0F2FE" stroke="#0F172A" stroke-width="3.5"/>
  <clipPath id="mugClip"><rect x="18" y="22" width="30" height="46" rx="6"/></clipPath>
  <g clip-path="url(#mugClip)">
    <rect x="16" y="${top}" width="38" height="${72 - top}" fill="${c.top}"/>
    <path d="M14 ${top + 1}C18 ${top - 2} 23 ${top + 3} 28 ${top}C33 ${top - 3} 38 ${top + 2} 43 ${top - 1}C47 ${top - 3} 50 ${top} 52 ${top + 1}V${top + 6}H14V${top + 1}Z" fill="#FFFFFF"/>
    <circle cx="25" cy="${BUBBLE_Y[index]}" r="2" fill="#FFFFFF" fill-opacity="0.8"/>
    <circle cx="38" cy="${BUBBLE_Y[index] + 4}" r="2.5" fill="#FFFFFF" fill-opacity="0.8"/>
  </g>
  <line x1="21" y1="32" x2="27" y2="32" stroke="#0F172A" stroke-width="2" stroke-linecap="round" opacity="0.45"/>
  <line x1="21" y1="44" x2="29" y2="44" stroke="#0F172A" stroke-width="2" stroke-linecap="round" opacity="0.45"/>
  <line x1="21" y1="56" x2="27" y2="56" stroke="#0F172A" stroke-width="2" stroke-linecap="round" opacity="0.45"/>
  <rect x="16" y="20" width="34" height="50" rx="7" fill="none" stroke="#0F172A" stroke-width="3.5"/>
</g>
`);
}

/** Chope vide inclinée, sans libellé. */
function pastTotem(): string {
    return wrap(92, 69, `
<g transform="translate(10 4)">
  <g transform="rotate(-16 36 42)">
    <path d="M48 28H56C59 28 61 30.5 61 34V48C61 51.5 59 54 56 54H48" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
    <rect x="16" y="18" width="32" height="46" rx="6" fill="#F1F5F9" stroke="#475569" stroke-width="3.5"/>
    <path d="M21 29C24 31 28 28 32 30" fill="none" stroke="#CBD5E1" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M26 41C30 42 35 39 39 41" fill="none" stroke="#CBD5E1" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M18 58C24 57 38 57 46 58V61C46 62.5 44.5 63 42 63H22C19.5 63 18 62.5 18 61V58Z" fill="#CBD5E1"/>
    <line x1="22" y1="24" x2="22" y2="54" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
  </g>
  <path d="M15 56C15 56 12 60 12 62C12 63.7 13.3 65 15 65C16.7 65 18 63.7 18 62C18 60 15 56 15 56Z" fill="#94A3B8" stroke="#475569" stroke-width="1.5"/>
</g>
`);
}

/** Girafe de bar 5 L, graduée, avec le nombre d'apéros sur le tube. */
function groupTotem(count: number, palette: TotemPalette): string {
    const c = palette;
    return wrap(96, 110, `
<g transform="translate(9 2)">
  <path d="M18 96H60L65 104H13L18 96Z" fill="#0F172A" stroke="#0F172A" stroke-width="3" stroke-linejoin="round"/>
  <rect x="23" y="80" width="32" height="17" rx="3" fill="#1E293B" stroke="#0F172A" stroke-width="3.2"/>
  <rect x="25" y="16" width="28" height="66" rx="5" fill="${c.top}" stroke="#0F172A" stroke-width="3.5"/>
  <rect x="27" y="50" width="24" height="30" fill="${c.bottom}" fill-opacity="0.55"/>
  <rect x="29" y="22" width="4" height="54" rx="2" fill="#FFFFFF" fill-opacity="0.5"/>
  <line x1="45" y1="28" x2="51" y2="28" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="47" y1="39" x2="51" y2="39" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="45" y1="50" x2="51" y2="50" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="47" y1="61" x2="51" y2="61" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="45" y1="72" x2="51" y2="72" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <path d="M53 70H64V77H60V74H53V70Z" fill="#0F172A"/>
  <path d="M61 61L65 71H59L61 61Z" fill="#EA580C" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/>
  <path d="M22 17C22 13 26 11 30 12C33 9 43 9 46 12C50 11 55 13 55 17C55 20 52 21 49 21H27C24 21 22 20 22 17Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="3"/>
  <rect x="31" y="4" width="16" height="6" rx="3" fill="#0F172A"/>
  <rect x="20" y="36" width="38" height="24" rx="8" fill="${c.stroke}" stroke="#FFFFFF" stroke-width="2.5"/>
  <text x="39" y="53" text-anchor="middle" fill="#FFFFFF" font-size="${count > 9 ? 12 : 15}" ${FONT}>${count}</text>
</g>
`);
}

export function activeLabel(participants?: number): string {
    return participants && participants > 0 ? `EN COURS · +${participants}` : 'EN COURS';
}

export function clockLabel(value?: string): string {
    if (!value) return 'PROGRAMMÉ';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'PROGRAMMÉ';
    return date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
}

export function pastLabel(value?: string): string {
    if (!value) return 'VIDE';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'VIDE';
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "VIDE · À L'INSTANT";
    if (minutes < 60) return `VIDE · ${minutes} MIN`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `VIDE · ${hours} H`;
    return `VIDE · ${Math.floor(hours / 24)} J`;
}

export function groupLive(statuses: readonly AperoStatus[]): boolean {
    return statuses.some((status) => status === 'active' || status === 'scheduled');
}

export function activeTotemAnimation(palette: TotemPalette): TotemAnimation {
    const key = keyOf('active', 0, palette);
    return {
        key,
        frames: CLINK_LEFT.map((_, index) => ({
            key, svg: activeTotem(index, palette), width: 108, height: 72,
        })),
    };
}

export function scheduledTotemAnimation(palette: TotemPalette): TotemAnimation {
    const key = keyOf('scheduled', 0, palette);
    return {
        key,
        frames: LIQUID_TOP.map((_, index) => ({
            key, svg: scheduledTotem(index, palette), width: 92, height: 74,
        })),
    };
}

export function pastTotemSpec(): TotemSpec {
    const palette = totemPalette(null, true);
    return {key: keyOf('past', 0, palette), svg: pastTotem(), width: 92, height: 69};
}

export function groupTotemSpec(count: number, palette: TotemPalette): TotemSpec {
    return {
        key: keyOf('group', count, palette),
        svg: groupTotem(count, palette),
        width: 96,
        height: 110,
    };
}
