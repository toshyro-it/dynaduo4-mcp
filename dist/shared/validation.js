import { z } from 'zod';
// Data ISO que também rejeita datas inexistentes no calendário (ex.: 2026-02-31),
// não só o formato. Comparação lexicográfica de strings ISO = ordem cronológica.
export const isoDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD.')
    .refine(isRealDate, 'Data inexistente no calendário.');
function isRealDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
// Retorna o rótulo do primeiro intervalo invertido (de > ate), ou null se todos ok.
export function firstInvertedRange(pairs) {
    for (const [label, de, ate] of pairs) {
        if (de !== undefined && ate !== undefined && de > ate)
            return label;
    }
    return null;
}
// .NET string.Length e JavaScript length contam unidades UTF-16.
// Zod 4 max() conta code points; o refine mantém a mesma fronteira da API para emojis.
export const utf16Text = (max) => z.string().trim().min(1).max(max)
    .refine(value => value.length <= max, `Máximo de ${max} unidades UTF-16.`);
