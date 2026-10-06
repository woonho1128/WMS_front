/** 받은 파일(Blob)을 이름을 붙여 저장한다 — CSV · 증빙 ZIP 내려받기가 같이 쓴다 */
export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // 바로 지우면 큰 파일은 저장이 시작되기 전에 주소가 사라질 수 있다
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
