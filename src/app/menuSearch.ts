/**
 * 좌측 메뉴 검색용 한글 매칭.
 *
 * - 대소문자·띄어쓰기 무시            "입고확정" → "입고 확정"
 * - 초성 검색                          "ㅇㄱㅎㅈ" → "입고 확정"
 * - 초성·완성형 혼합                   "입ㄱ"     → "입고 확정"
 * - 입력 조합 중인 마지막 글자 허용     "입고화"   → "입고 확정"  (IME 가 "확"을 완성하기 전)
 *                                       "입곻"     → "입고 확정"  (받침이 다음 글자 초성으로 넘어가기 전)
 */

const CHOSUNG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JONGSUNG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 조합 중 확장될 수 있는 중성 (ㅗ→ㅘㅙㅚ, ㅜ→ㅝㅞㅟ, ㅡ→ㅢ) */
const JUNG_GROWS: Record<number, number[]> = { 8: [9, 10, 11], 13: [14, 15, 16], 18: [19] };
/** 조합 중 겹받침으로 확장될 수 있는 받침 (ㄱ→ㄳ, ㄴ→ㄵㄶ, ㄹ→ㄺ…ㅀ, ㅂ→ㅄ) */
const JONG_GROWS: Record<number, number[]> = { 1: [3], 4: [5, 6], 8: [9, 10, 11, 12, 13, 14, 15], 17: [18] };
/** 겹받침이 다음 글자로 넘어갈 때 남는 받침/넘어가는 초성 */
const JONG_SPLIT: Record<number, [number, string]> = {
  3: [1, "ㅅ"], 5: [4, "ㅈ"], 6: [4, "ㅎ"], 9: [8, "ㄱ"], 10: [8, "ㅁ"], 11: [8, "ㅂ"],
  12: [8, "ㅅ"], 13: [8, "ㅌ"], 14: [8, "ㅍ"], 15: [8, "ㅎ"], 18: [17, "ㅅ"]
};

const BASE = 0xac00;
const LAST = 0xd7a3;

type Syllable = { cho: number; jung: number; jong: number };

const decompose = (ch: string): Syllable | null => {
  const code = ch.charCodeAt(0);
  if (code < BASE || code > LAST) return null;
  const offset = code - BASE;
  return { cho: Math.floor(offset / 588), jung: Math.floor((offset % 588) / 28), jong: offset % 28 };
};

const compose = ({ cho, jung, jong }: Syllable) => String.fromCharCode(BASE + cho * 588 + jung * 28 + jong);

const isChosung = (ch: string) => CHOSUNG.includes(ch);

/** 대상 글자 하나가 검색 글자 하나와 맞는가. pending=true 면 조합 중인 글자로 보고 느슨하게 비교 */
const charMatches = (target: string, query: string, pending: boolean) => {
  if (target === query) return true;
  const t = decompose(target);
  if (!t) return false;
  if (isChosung(query)) return CHOSUNG[t.cho] === query;
  if (!pending) return false;

  const q = decompose(query);
  if (!q || q.cho !== t.cho) return false;
  const jungOk = q.jung === t.jung || (q.jong === 0 && (JUNG_GROWS[q.jung] ?? []).includes(t.jung));
  if (!jungOk) return false;
  if (q.jong === 0) return true;
  return q.jung === t.jung && (q.jong === t.jong || (JONG_GROWS[q.jong] ?? []).includes(t.jong));
};

/** 마지막 글자의 받침이 다음 글자 초성으로 넘어갈 경우를 대비한 검색어 변형 */
const queryVariants = (query: string[]): string[][] => {
  const variants = [query];
  const last = decompose(query[query.length - 1] ?? "");
  if (!last || last.jong === 0) return variants;

  const head = query.slice(0, -1);
  const split = JONG_SPLIT[last.jong];
  if (split) {
    // "읽" → "일" + "ㄱ"
    variants.push([...head, compose({ ...last, jong: split[0] }), split[1]]);
  } else if (isChosung(JONGSUNG[last.jong])) {
    // "입곻" → "입고" + "ㅎ"
    variants.push([...head, compose({ ...last, jong: 0 }), JONGSUNG[last.jong]]);
  }
  return variants;
};

export type MatchRange = [start: number, end: number];

/** text 안에서 query 와 맞는 구간(원문 인덱스)을 돌려준다. 없으면 null */
export const matchText = (text: string, rawQuery: string): MatchRange | null => {
  const query = Array.from(rawQuery.toLowerCase().replace(/\s+/g, ""));
  if (!query.length || !text) return null;

  // 공백을 뺀 글자열 + 원문 위치 매핑 (하이라이트는 원문 기준으로 그린다)
  const lower = text.toLowerCase();
  const chars: string[] = [];
  const positions: number[] = [];
  for (let i = 0; i < lower.length; i += 1) {
    if (!/\s/.test(lower[i])) {
      chars.push(lower[i]);
      positions.push(i);
    }
  }

  for (const variant of queryVariants(query)) {
    for (let start = 0; start + variant.length <= chars.length; start += 1) {
      let ok = true;
      for (let j = 0; j < variant.length; j += 1) {
        if (!charMatches(chars[start + j], variant[j], j === variant.length - 1)) {
          ok = false;
          break;
        }
      }
      if (ok) return [positions[start], positions[start + variant.length - 1] + 1];
    }
  }
  return null;
};
