import { useEffect, useRef, useState } from "react";
import { DashboardCard } from "../dashboard/components/DashboardCard";
import { apiPost } from "../../services/http";
import "./ChatbotPage.css";

type Row = { label: string; value: string };
type ChatAnswer = { intent: string; answer: string; rows: Row[] };
type Message = { role: "user" | "bot"; text: string; rows?: Row[] };

const SUGGESTIONS = ["재고 현황 알려줘", "쇼트 품목 있어?", "출고 현황", "장기재고 금액", "보충 대상", "격납대기 몇 건?"];

export const ChatbotPage = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "안녕하세요! WMS AI 챗봇입니다. 재고·입고·출고·쇼트·보충·장기재고·격납·반품을 물어보세요.", rows: SUGGESTIONS.map((s) => ({ label: s, value: "" })) }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await apiPost<ChatAnswer>("/chatbot/ask", { question: q });
      setMessages((m) => [...m, { role: "bot", text: res.answer, rows: res.rows }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot", text: `오류: ${e instanceof Error ? e.message : "조회 실패"} (백엔드 18080 확인)` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="outbound-page">
      <DashboardCard className="chatbot-card" title="AI 챗봇 — 자연어 WMS 데이터 조회">
        <div className="chatbot-log">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="chat-bubble">
                <div className="chat-text">{m.text}</div>
                {m.rows && m.rows.length > 0 ? (
                  m.role === "bot" && m.rows.every((r) => r.value === "") ? (
                    // 추천 질문 칩
                    <div className="chat-chips">
                      {m.rows.map((r) => (
                        <button key={r.label} type="button" className="chat-chip" onClick={() => send(r.label)} disabled={busy}>{r.label}</button>
                      ))}
                    </div>
                  ) : (
                    <table className="chat-rows">
                      <tbody>
                        {m.rows.map((r, j) => (
                          <tr key={j}><td className="chat-row-label">{r.label}</td><td className="chat-row-value">{r.value}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : null}
              </div>
            </div>
          ))}
          {busy ? <div className="chat-msg bot"><div className="chat-bubble"><div className="chat-text">조회 중…</div></div></div> : null}
          <div ref={endRef} />
        </div>

        <div className="chatbot-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="예: 재고 현황 알려줘 / 쇼트 품목 있어?"
            disabled={busy}
          />
          <button type="button" className="btn-primary" disabled={busy || !input.trim()} onClick={() => send(input)}>전송</button>
        </div>
      </DashboardCard>
    </section>
  );
};
