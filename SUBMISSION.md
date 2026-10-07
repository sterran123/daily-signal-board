# 과제 4 제출 — 오늘의 진짜 정보판

## 결과물 URL

https://sterran123.github.io/daily-signal-board/

## 소스 저장소 URL

https://github.com/sterran123/daily-signal-board/commit/COMMIT_HASH_AFTER_BUILD

## 재현·통과 확인 4가지

1. **어디로 가나요** — 공개 결과물 URL을 새 시크릿 창에서 엽니다. 로그인은 필요하지 않습니다.
2. **무엇을 하나요 (3단계)** — ① `지금 다시 조회`를 누릅니다. ② 원자료·저장값·화면값과 출처 시각·조회 시각·KST 날짜를 확인합니다. ③ `실패 상황 재생`에서 느린 응답을 실행하고 `오류 후 복구`를 누릅니다.
3. **무엇이 보이면 통과인가요** — 서울 현재 기온의 원자료·정규화 저장값·화면값이 일치합니다. 실패 재생에서는 마지막 정상값과 행이 유지되고 복구 뒤 `fresh / none`으로 돌아옵니다.
4. **안 될 때 무엇이 보이나요** — 실패 종류에 맞는 `timeout`·`auth`·`rate_limit`·`offline`·`schema_error`와 마지막 정상값 또는 정상값 부재 설명이 표시됩니다.

## AI와 내 판단 3줄

- **AI에게 맡긴 일** — Open-Meteo 조회·정규화·KST 일별 저장·전일 대비 계산·오류 상태 보존·합성 fixture 재생·화면과 자동 테스트 구현
- **직접 판단한 일** — 개인 위치나 비밀키를 쓰지 않도록 서울시청 고정 좌표를 선택하고 원자료·저장값·화면값을 함께 보이도록 했습니다.
- **AI 제안을 따르지 않은 일** — 처음 검토한 USD/KRW API는 출처 시각 요구를 충족하지 못하거나 공개 서비스 표시 제한이 있어 사용하지 않았습니다. 출처 시각과 CC BY attribution을 제공하는 Open-Meteo를 선택했습니다.

## 실제 날짜 기록 상태

합성 D1/D2와 오류 fixture는 실제 증거가 아닙니다. 공개 결과물을 연 첫 정상 조회가 첫 실제 KST 일별 기록이 됩니다. 두 번째 실제 기록은 다른 KST 날짜에 같은 브라우저로 공개 결과물을 다시 열어 생성해야 합니다. 두 날짜 기록을 만들기 전에는 T04-C22~C24가 완료되지 않은 상태입니다. 기록 날짜와 값을 합성 fixture로 채우지 않았습니다.

## 공개 원천

- Open-Meteo: https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m&timezone=Asia%2FSeoul
- 기상 자료는 15분 간격 모델 기반 현재 조건값입니다. 측정소 실측값이라고 표시하지 않습니다.
- [Open-Meteo CC BY 4.0 라이선스](https://open-meteo.com/en/licence)
- 실제 기록은 브라우저 로컬 저장소에 보관합니다. 로그인·계정·위치 권한·API 비밀키는 사용하지 않습니다.
