# 오늘의 진짜 정보판

서울·부산·인천·대구·대전·광주·제주 중 지역을 직접 골라 15분 간격 모델 기반 현재 기온을 조회하고 KST 날짜별로 기록하는 무로그인 브라우저 정보판입니다. 각 지역의 시청 중심 좌표를 사용하며 위치 권한은 요청하지 않습니다. 측정소 실측값과 구분해 표시하고, 같은 지역의 어제와 비교하며 마지막 정상값·출처 시각·조회 시각·오류 상태를 보여줍니다.

## 공개 데이터 원천

Open-Meteo `current.temperature_2m`를 사용합니다. 선택한 지역의 시청 중심 좌표만 조회하며 브라우저 위치 권한과 API 키는 사용하지 않습니다. 지역별 `signal_id`와 출처 URL을 저장하므로 다른 지역 기록을 서로 비교하지 않습니다. 응답의 `current.time`은 원천 기준 시각이고 `fetched_at`은 앱이 응답을 받은 시각입니다. 두 값은 혼동하지 않고 모두 Asia/Seoul로 표시합니다.

- [Open-Meteo API 문서](https://open-meteo.com/en/docs)
- [Open-Meteo 라이선스](https://open-meteo.com/en/licence)
- 화면 내 원천 링크와 CC BY 4.0 출처 표시 포함
- 무료 API는 비상업 용도 및 사용량 제한이 있습니다. 조회는 페이지 진입·지역 변경·사용자가 누른 재조회 때만 이뤄지며 정기 자동 조회는 하지 않습니다.

## 저장과 장애 상태

정상 조회는 정확히 정규화한 원자료·KST 일별 행·화면값을 브라우저 로컬 저장소에 보관합니다. 같은 `signal_id + record_date`는 기존 행을 갱신하고 다른 KST 날짜는 새 행이 됩니다. 선택 지역별 기록은 분리되며, 어제 대비도 같은 지역의 저장값만 사용합니다.

실패하면 마지막 정상값과 일별 행을 유지한 채 `stale` 및 오류 코드를 별도로 표시하고, 오류 종류별 설명과 다음 행동을 안내합니다. 느린 응답·401/403·429·오프라인·형식 변경은 실제 API를 망가뜨리지 않고 합성 fixture로 재생할 수 있습니다. 합성 재생 상태는 실제 기록과 분리되어 있고 초기화 버튼은 합성 상태만 초기화합니다.

GitHub Pages는 정적 파일을 공개하는 호스팅이며 방문자 간 기록을 공유하지 않습니다. 정상 조회 기록과 선택 지역은 해당 브라우저의 로컬 저장소에 남습니다. 두 날짜를 비교하려면 같은 브라우저에서 같은 지역을 선택한 채 서로 다른 KST 날짜에 정상 조회해야 합니다. 이 앱에는 계정·위치 권한·API 비밀키가 없으며 fixture의 D1/D2는 실제 날짜 증거를 대신하지 않습니다.

## 실행

앱은 `index.html`, `styles.css`, `app.js`, `core.js`로 이루어진 순수 HTML·CSS·JavaScript이며 프레임워크나 패키지 설치가 없습니다. Node.js는 로컬 정적 서버와 선택 테스트 실행에만 사용합니다.

```sh
node serve.mjs
```

로컬 주소는 `http://localhost:8082/`입니다. 테스트는 별도 패키지 설치 없이 실행합니다.

```sh
node --test core.test.cjs
```

## 배포

`main` 브랜치에 push하면 `.github/workflows/pages.yml`이 구문 검사와 9개 결정론 테스트를 통과한 뒤 GitHub Pages에 배포합니다. 결과물 주소는 `https://sterran123.github.io/daily-signal-board/`입니다.

## T04 공개 fixture

제공된 원본 자료는 `고정 자산/`에 보관하고, 앱에서 재생하는 공개 패키지는 `assets/studio-task-assets/t04-real-information-board/`에 둡니다. 두 추출본의 `asset-manifest.json`이 일치합니다. 패키지 ID는 `aleph-t04-real-information-board-public-contract-v2`이며, 17개 파일의 바이트 수와 SHA-256은 `core.test.cjs`에서 검사합니다.

원본 ZIP SHA-256: `CA123FC72B1B15E83D4FE3C9AAB5189496EDA489C2A06EFE55049C0AA57AC899`

합성 성공·오류·복구 시나리오의 기준과 한계는 제공된 사용법과 fixture 폴더의 README 및 `public-contract.json`에 있습니다.
