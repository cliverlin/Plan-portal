# 오피스키퍼 기획 산출물 관리 포털

기획 의도를 명확히 공유하고 효율적인 협업을 돕기 위한 프로토타입 포털입니다. 기존 Netlify 정적 사이트는 그대로 유지하면서, 승인된 개인 Google Drive 폴더의 단일 HTML 파일을 자동으로 목록에 표시하고 별도 탭에서 격리 실행할 수 있습니다.

## 동작 방식

1. 게시 담당자가 승인된 Google Drive 폴더 또는 그 하위 폴더에 단일 `.html` 파일을 업로드합니다.
2. Runner의 Netlify Function이 Drive 목록을 읽고, 포털 인덱스 상단에 파일명과 게시 일시를 최신 게시순으로 바로 표시합니다. Drive 파일용 중간 그룹 카드나 상세 페이지는 만들지 않습니다.
3. 사용자가 파일 행을 누르면 `target="_blank"`와 `noopener noreferrer`로 독립된 새 탭이 열립니다.
4. HTML은 포털 출처가 아닌 별도 Runner Netlify 사이트에서 내려받습니다. Runner는 승인 루트부터 폴더 경로를 다시 검증하고 해당 폴더의 허용된 HTML만 실행합니다.

목록은 최대 60초 캐시되므로 새 파일이 보이기까지 최대 약 1분이 걸릴 수 있습니다. 새 파일을 추가하면 별도 묶음 없이 같은 목록에 추가되며, 게시 일시가 최신인 파일이 위에 표시됩니다. Drive 파일은 자기 완결형 단일 HTML이어야 합니다. 같은 폴더의 상대 경로 이미지·CSS·JS는 자동으로 함께 배포되지 않습니다.

포털의 `목록 새로고침` 버튼은 포털과 Runner 목록 캐시를 한 번만 우회해 Google Drive를 즉시 다시 조회합니다. 일반 조회에는 60초 캐시를 유지하므로 불필요한 Drive API 호출은 늘어나지 않습니다.

## 보안 경계

- 공개 폴더 조회용 Google Drive API key는 Netlify Function 환경변수에만 저장하며 브라우저 응답에 포함하지 않습니다.
- API key는 Google Drive API로만 제한하고 파일 수정 권한은 부여하지 않습니다. 비공개 폴더로 전환할 때만 읽기 전용 OAuth를 선택적으로 사용할 수 있습니다.
- 목록과 실행 시점 모두 `GOOGLE_DRIVE_FOLDER_ID`부터 요청 폴더까지 부모-자식 관계를 매 단계 검증합니다. 게시용 공간 밖의 폴더·파일, 삭제된 항목과 Drive 바로가기는 허용하지 않습니다.
- `.html`/`.htm`, 허용 MIME type, 삭제 여부, 최대 파일 크기를 모두 검사합니다.
- 실행 사이트는 포털과 다른 origin이어야 합니다. 실행 응답에는 CSP `sandbox`(same-origin 권한 없음), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store`, `no-referrer`를 적용합니다.
- Runner에는 업로드·수정 권한이 없고 승인 폴더 파일도 읽기만 합니다.

상세 설계와 운영 체크리스트는 [Google Drive 게시 설정 문서](docs/google-drive-publishing.md)를 참고하세요.

## 저장소 구조

```text
assets/                         기존 포털 UI
data/projects.js                저장소에 포함된 기존 프로토타입 목록
netlify/functions/              포털의 Drive 목록 API
runner/                         별도 출처로 배포할 HTML 실행 사이트
scripts/build-portal.js         공개 파일만 dist에 복사하는 빌드
server/drive.js                 Drive 인증·조회·폴더 검증 공통 로직
test/                           서버 로직과 보안 헤더 테스트
```

## 환경변수

실제 값은 커밋하지 않습니다. 키 이름과 예시는 [.env.example](.env.example)에 있습니다.

| 변수 | 포털 | Runner | 설명 |
| --- | :---: | :---: | --- |
| `GOOGLE_DRIVE_API_KEY` | 불필요 | 필요 | 공개 폴더 목록·파일 조회용 서버 측 API key |
| `GOOGLE_DRIVE_FOLDER_ID` | 불필요 | 필요 | `1nvXxRHtqv9ibQN-mM46o-NVW_GdhTKq5` |
| `DRIVE_RUNNER_ORIGIN` | 필요 | 불필요 | Runner의 HTTPS origin, 예: `https://ok-plan-runner.netlify.app` |
| `DRIVE_MAX_FILE_BYTES` | 선택 | 선택 | 단일 HTML 최대 크기, 기본 5 MiB |

현재 공개 폴더 운영에는 위 네 변수만 사용합니다. 코드는 추후 폴더를 비공개로 바꿀 경우를 위해 `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` 조합도 대체 인증 방식으로 지원합니다.

Netlify UI의 **Project configuration → Environment variables**에서 등록하고, 가능한 플랜에서는 scope를 Functions로 제한하며 secret 값으로 표시하세요. 환경변수 변경 뒤에는 다시 배포해야 Function에 적용됩니다.

## 로컬 테스트

Node.js 20 이상에서 외부 패키지 설치 없이 실행할 수 있습니다.

```bash
npm run build
npm test
```

`npm run build`는 기존 URL 구조를 유지하면서 공개에 필요한 파일만 `dist/`에 복사합니다. 서버 코드, 테스트, 문서, 환경변수 예시는 포털 정적 배포물에 포함되지 않습니다.

정적 화면만 확인하려면 임의의 로컬 HTTP 서버로 저장소 루트를 열 수 있습니다. Drive 자동 목록은 Netlify Functions 또는 동일한 `/api/drive-projects` 경로를 제공하는 환경에서 동작합니다.

실제 Runner 목록까지 포함한 로컬 화면은 배포 없이 다음 명령으로 확인할 수 있습니다.

```bash
npm run preview:local
```

브라우저에서 `http://127.0.0.1:4173`을 열면 됩니다.

### 하위 폴더 UI를 배포 없이 확인하기

```bash
npm run preview:demo
```

`http://127.0.0.1:4173`에서 예시 폴더·소유자·파일을 탐색할 수 있습니다. 화면의 `로컬 미리보기 · 예시 데이터` 표시는 실제 Drive 목록이 아니라는 뜻입니다. `제품 기획 → 챗봇 → 보고서 → 이전 버전`은 여러 뎁스 확인용이고, `프로토타입 검토`에는 스크롤 확인용 파일 24개가 있습니다. 사진이 있는 소유자, 이름 첫 글자 대체 표시, 소유자 정보가 없는 파일을 모두 포함합니다. 예시 프로필은 실제 사람의 사진이 아닌 도형입니다. 예시 파일과 프로필은 로컬 전용이며 `dist`에 포함되지 않습니다.

파일 행은 60px 높이이며, 긴 파일명은 한 줄 말줄임과 전체 이름 툴팁을 제공합니다. 경로의 각 폴더명을 누르면 해당 경로로 이동하고 뒤로/앞으로 이동, 폴더 URL 재접속도 지원합니다. 검색과 소유자 필터는 **현재 폴더의 파일**을 대상으로 하며, 소유자 필터를 선택해도 하위 폴더는 탐색을 위해 계속 표시합니다. 다른 폴더로 이동하면 검색과 소유자 필터를 초기화하고, 목록 새로고침은 유지합니다. `총 N개`는 현재 폴더의 HTML 파일 수이며 폴더 수는 별도로 표시합니다.

링크 아이콘은 Drive 다운로드 링크가 아닌 **Runner HTML 실행 링크**를 복사합니다. 자동 복사가 제한된 브라우저에서는 수동 복사용 창을 제공합니다. 하위 파일 링크에는 검증할 폴더 경로가 포함되므로 파일을 다른 폴더로 옮기면 새 위치에서 링크를 다시 복사해야 합니다.

실제 Drive로 로컬 포털과 로컬 Runner를 함께 테스트하려면, Git에서 제외된 `.env`에 기존 Runner의 서버 환경변수(`GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID`; 또는 읽기 전용 OAuth)를 안전하게 넣고 다음을 실행합니다. 실제 값은 브라우저나 저장소에 넣지 않습니다.

```bash
npm run preview:drive
```

포털은 `4173`, 격리된 로컬 Runner는 `4174` 포트로 실행됩니다. 기본 포트를 변경하려면 `PORT`, `RUNNER_PORT` 환경변수를 사용합니다. `preview:drive`의 환경변수 파일 자동 로딩은 [Node 22.9 이상](https://nodejs.org/api/cli.html#--env-file-if-existsfile)이 필요합니다. 공개 폴더 조회는 읽기만 수행하며 Drive에 쓰기나 권한 변경을 하지 않습니다. `preview:local`은 기존에 배포된 Runner에 연결하므로 **Runner가 갱신되기 전에는 새 폴더·소유자 기능을 실제 데이터로 검증할 수 없습니다.**

이 기능을 나중에 배포할 때는 새 목록 형식과 경로 검증을 제공하는 Runner를 먼저, 포털을 그다음 배포합니다. 화면 확인 요청만으로 커밋·푸시·실배포를 수행하지 않습니다.

## 배포 개요

- 기존 포털 Netlify 사이트: 저장소 루트의 `netlify.toml`을 사용합니다.
- Runner Netlify 사이트: 같은 저장소를 두 번째 사이트로 연결하고 Package directory를 `runner`, Base directory는 비워 저장소 루트를 유지합니다. `runner/netlify.toml`이 적용되는지 Deploy log에서 확인합니다.
- 두 사이트에 필요한 환경변수를 각각 넣은 뒤 Runner를 먼저 배포하고, 확정된 Runner HTTPS origin을 포털의 `DRIVE_RUNNER_ORIGIN`에 등록해 포털을 다시 배포합니다.

Google Cloud API key 생성, Netlify 환경변수 입력, 두 사이트의 production deploy는 계정 소유자 권한이 필요한 수동 단계입니다. 현재처럼 공개 폴더를 사용하면 Google OAuth 동의는 필요하지 않습니다.
