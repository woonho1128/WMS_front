import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../../../app/store/authStore";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { QrBox } from "../../../components/ui/QrBox";
import { apiGet } from "../../../services/http";
import { fmtDate } from "../../../shared/appDate";
import { usePrint } from "../../../shared/usePrint";
import { fmtTime, groupBySet, itemLabel, orderIndexOf, ox, type OutboundSheet, type OutboundSheetOms } from "./outboundSheetModel";
import "./outboundSheet.css";

/* ============================================================
   출고요청서 — 기존 OMS 출고요청서 출력물을 WMS 화면 인쇄로 대신한다
   · 칸 배치와 이름은 기존 출력물 그대로 (현장이 보던 종이와 같게)
   · 바뀐 것: 바코드 글꼴(PC 에 없으면 글자로 찍힘) 대신 QR. 현장에는 PDA 가 없어 휴대폰 카메라로 찍는다(2026-10-14) —
     피킹 화면에서 이 QR 을 찍으면 그 건이 열린다. 휴대폰을 못 쓰면 종이로 피킹하고 사무실에서 출하번호로 찾아 결과를 넣는다
   · 용지 A4 세로, 여러 건이면 한 건씩 새 쪽에서 시작한다. 품목이 길면 다음 쪽으로 넘어가고 표 머리가 다시 찍힌다
   ============================================================ */

const BRAND = "DAELIM 바스&키친";
const PREVIEW_MAX = 5;

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDateTime = (d: Date) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const blank = (value: string | null | undefined) => value ?? "";

type SheetProps = { sheet: OutboundSheet; printedAt: string; printedBy: string };

/** 출고요청서 한 건 — 미리보기 · 인쇄 공용 */
export const OutboundSheetPage = ({ sheet, printedAt, printedBy }: SheetProps) => {
  // OMS 에서 받는 칸 — 연동 계약 저장 전에는 오지 않는다(빈칸으로 찍힘)
  const oms: OutboundSheetOms = sheet.oms ?? {};
  const groups = groupBySet(sheet.lines);
  const index = orderIndexOf(sheet.omsOrderNo);
  const address = [oms.zipCode ? `[${oms.zipCode}]` : "", sheet.shipAddress ?? ""].filter(Boolean).join(" ");
  let seq = 0;

  return (
    <article className="osh">
      <header className="osh-top">
        <div className="osh-brand">
          <b>{BRAND}</b>
          <span>출고요청서</span>
        </div>
        <div className="osh-id">
          <div className="osh-qr">
            <QrBox value={sheet.outboundNo} size="20mm" margin={1} />
          </div>
          <div className="osh-id-text">
            <span className="osh-orderno">{sheet.omsOrderNo ?? "오더번호 없음"}</span>
            <b className="osh-index">{index || "-"}</b>
            <span className="osh-outno">WMS {sheet.outboundNo}</span>
          </div>
        </div>
      </header>

      <p className="osh-summary">{blank(oms.requestSummary)}</p>

      <div className="osh-sign">
        <div>
          <b>대형물</b> : 피킹작업자 <i /> 검수담당자 <i />
        </div>
        <div>
          <b>부자재</b> : 피킹작업자 <i /> 검수담당자 <i />
        </div>
      </div>

      <table className="osh-info">
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "14.5%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th>오더번호</th>
            <td>{blank(sheet.omsOrderNo)}</td>
            <th>오더유형</th>
            <td>{oms.orderTypeName ?? blank(sheet.outType)}</td>
            <th>출하번호</th>
            <td>{blank(sheet.shipNo)}</td>
            <th>납품처</th>
            <td>{blank(sheet.customerName)}</td>
          </tr>
          <tr>
            <th>영업그룹</th>
            <td>{blank(oms.salesGroupName)}</td>
            <th>담당자</th>
            <td>{blank(oms.salesRepName)}</td>
            <th>Tel</th>
            <td>{blank(oms.salesRepTel)}</td>
            <th>Mobile</th>
            <td>{blank(oms.salesRepMobile)}</td>
          </tr>
          <tr>
            <th>고객명</th>
            <td>{blank(oms.ordererName)}</td>
            <th>거주여부</th>
            <td>{ox(oms.residing)}</td>
            <th>Tel</th>
            <td>{blank(oms.ordererTel)}</td>
            <th>Mobile</th>
            <td>{blank(oms.ordererMobile)}</td>
          </tr>
          <tr>
            <th>현장주소</th>
            <td colSpan={5} className="is-strong is-left">
              {address}
            </td>
            <th>인수자</th>
            <td className="is-strong">{blank(oms.receiverName)}</td>
          </tr>
          <tr>
            <th>출고요청일</th>
            <td className="is-strong">{(sheet.scheduledDate ?? "").replace(/-/g, "")}</td>
            <th>요청시간</th>
            <td className="is-strong">{fmtTime(oms.requestedTime)}</td>
            <th>세대반입 유무</th>
            <td className="is-strong">{ox(oms.householdCarryIn)}</td>
            <th>Mobile</th>
            <td className="is-strong">{blank(oms.receiverMobile)}</td>
          </tr>
          <tr className="is-tall">
            <th>출고메모</th>
            <td colSpan={7} className="is-left">
              {blank(oms.shippingMemo)}
            </td>
          </tr>
          <tr>
            <th>물류메모</th>
            <td colSpan={5} className="is-left" />
            <th>물류담당자</th>
            <td />
          </tr>
        </tbody>
      </table>

      {groups.map((group) => (
        <section key={group.name} className="osh-set">
          <h3 className="osh-set-name">{group.name}</h3>
          <table className="osh-items">
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "17%" }} />
              <col />
              <col style={{ width: "7%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>순번</th>
                <th>Location</th>
                <th>제품코드</th>
                <th>제품명</th>
                <th>수량</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {group.lines.map((line) => {
                seq += 1;
                return (
                  <tr key={seq} className={line.separateLoading ? "is-separate" : undefined}>
                    <td>{seq}</td>
                    <td>{line.locationCode ?? "미지정"}</td>
                    <td>{line.itemCode}</td>
                    <td className="is-strong is-left">{itemLabel(line)}</td>
                    <td className="num">{line.qty.toLocaleString("ko-KR")}</td>
                    <td className="is-left osh-memo">{blank(line.lineMemo)}</td>
                  </tr>
                );
              })}
              {/* 합계는 tfoot 이 아니라 마지막 줄로 — tfoot 은 쪽이 넘어갈 때마다 다시 찍힌다 */}
              <tr className="osh-total">
                <td colSpan={4}>합계</td>
                <td className="num">{group.totalQty.toLocaleString("ko-KR")}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      {!groups.length ? <p className="osh-empty">출고할 품목이 없습니다.</p> : null}

      <div className="osh-pack">
        Pallet 수량 <i /> 부자재BOX 수량 <i /> 욕조부속 <i />
      </div>

      <footer className="osh-foot">
        <span>
          {[sheet.warehouseName, sheet.carrier ?? "배송사 미정", sheet.status].filter(Boolean).join(" · ")}
        </span>
        <span>
          출력 {printedAt}
          {printedBy ? ` · ${printedBy}` : ""}
        </span>
      </footer>
    </article>
  );
};

type DialogProps = {
  /** 인쇄할 출고 id — null 이면 닫힘 */
  ids: number[] | null;
  onClose: () => void;
};

/** 출고요청서 미리보기 · 인쇄 창 */
export const OutboundSheetDialog = ({ ids, onClose }: DialogProps) => {
  const [sheets, setSheets] = useState<OutboundSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedBy = useAuthStore((state) => state.user?.name ?? state.user?.id ?? "");
  const { printing, print } = usePrint("is-printing-sheets", "A4", "8mm");

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    setSheets(null);
    setError(null);
    Promise.all(ids.map((id) => apiGet<OutboundSheet>(`/outbounds/${id}/sheet`)))
      .then((list) => {
        if (alive) setSheets(list);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "출고요청서를 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, [ids]);

  // 출력 시각은 창을 연 때 — 미리보기와 종이가 같게
  const printedAt = useMemo(() => fmtDateTime(new Date()), [sheets]);
  const preview = (sheets ?? []).slice(0, PREVIEW_MAX);
  const count = ids?.length ?? 0;

  return (
    <>
      <Modal
        open={ids !== null}
        className="osh-modal"
        title="출고요청서"
        desc={sheets?.length === 1 ? `${sheets[0].outboundNo} · ${sheets[0].customerName ?? ""}` : `${count}건 · A4 세로`}
        icon="printer"
        iconBg="var(--primary-bg)"
        iconColor="var(--primary-ink)"
        onClose={onClose}
        footer={
          <>
            <span className="osh-foot-msg">
              {sheets ? `${sheets.length}건 · 한 건씩 새 쪽에서 시작` : error ? "불러오기 실패" : "불러오는 중…"}
            </span>
            <button type="button" className="btn-secondary" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="btn-primary osh-print-btn" disabled={!sheets?.length || printing} onClick={print}>
              <Icon name="printer" size={15} />
              인쇄
            </button>
          </>
        }
      >
        {error ? (
          <div className="ds-callout danger">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        {!error && !sheets ? <p className="osh-more">불러오는 중…</p> : null}
        {preview.length ? (
          <div className="osh-preview">
            {preview.map((sheet) => (
              <div key={sheet.id} className="osh-paper">
                <OutboundSheetPage sheet={sheet} printedAt={printedAt} printedBy={printedBy} />
              </div>
            ))}
          </div>
        ) : null}
        {sheets && sheets.length > preview.length ? (
          <p className="osh-more">
            미리보기는 앞 {preview.length}건 — 인쇄하면 {sheets.length}건이 모두 나갑니다
          </p>
        ) : null}
        <p className="osh-note">
          <Icon name="alert" size={13} />
          <span>
            QR 에는 출고번호가 들어갑니다 — 피킹 화면에서 휴대폰 카메라로 찍으면 그 건이 바로 열립니다. 휴대폰을 못 쓰면 출하번호(WMS
            번호)를 입력하면 됩니다. 인쇄 창에서 용지는 A4, 배율은 기본(100%), “배경 그래픽”은 켜 두세요. 파일이 필요하면 “PDF로 저장”을
            고르면 됩니다.
          </span>
        </p>
      </Modal>

      {printing && sheets
        ? createPortal(
            <div className="osh-print-root">
              {sheets.map((sheet) => (
                <OutboundSheetPage key={sheet.id} sheet={sheet} printedAt={printedAt} printedBy={printedBy} />
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
};
