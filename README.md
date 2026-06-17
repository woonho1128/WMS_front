# DAELIM WMS Front

프론트 화면 검수용 React/Vite 프로젝트입니다.

## 실행

```powershell
npm install
npm run dev
```

기본 접속 주소:

```text
http://localhost:5173
```

## 데모 로그인

```text
admin / 1234
```

## 데이터 모드

현재는 백엔드와 DB 없이 화면 검수를 할 수 있도록 mock API 모드로 설정되어 있습니다.

```env
VITE_USE_MOCK_API=true
VITE_API_BASE_URL=
```

백엔드 연동으로 전환할 때는 `.env`를 아래처럼 바꾸면 됩니다.

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:18080/api
```
