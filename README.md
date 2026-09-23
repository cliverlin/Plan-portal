# 오피스키퍼 기획 산출물 관리 포털

기획 의도를 명확히 공유하고 효율적인 협업을 돕기 위한 프로토타입 포털입니다. 기존 Netlify 정적 사이트는 그대로 유지하면서, 승인된 개인 Google Drive 폴더의 단일 HTML 파일을 자동으로 목록에 표시하고 별도 탭에서 격리 실행할 수 있습니다.

## 동작 방식

1. 게시 담당자가 승인된 Google Drive 폴더의 **바로 아래**에 단일 `.html` 파일을 업로드합니다.
2. Runner의 Netlify Function이 Drive 목록을 읽고, 포털 인덱스 상단에 파일명과 게시 일시를 최신 게시순으로 바로 표시합니다. Drive 파일용 중간 그룹 카드나 상세 페이지는 만들지 않습니다.
3. 사용자가 파일 행을 누르면 `target="_blank"`와 `noopener noreferrer`로 독립된 새 탭이 열립니다.
4. HTML은 포털 출처가 아닌 별도 Runner Netlify 사이트에서 내려받습니다. Runner는 파일 ID를 다시 조회하여 승인 폴더의 직접 하위 HTML인지 검증한 뒤에만 실행합니다.

목록은 최대 60초 캐시되므로 새 파일이 보이기까지 최대 약 1분이 걸릴 수 있습니다. 새 파일을 추가하면 별도 묶음 없이 같은 목록에 추가되며, 게시 일시가 최신인 파일이 위에 표시됩니다. Drive 파일은 자기 완결형 단일 HTML이어야 합니다. 같은 폴더의 상대 경로 이미지·CSS·JS는 자동으로 함께 배포되지 않습니다.

포털의 `목록 새로고침` 버튼은 포털과 Runner 목록 캐시를 한 번만 우회해 Google Drive를 즉시 다시 조회합니다. 일반 조회에는 60초 캐시를 유지하므로 불필요한 Drive API 호출은 늘어나지 않습니다.

## 보안 경계

- 공개 폴더 조회용 Google Drive API key는 Netlify Function 환경변수에만 저장하며 브라우저 응답에 포함하지 않습니다.
- API key는 Google Drive API로만 제한하고 파일 수정 권한은 부여하지 않습니다. 비공개 폴더로 전환할 때만 읽기 전용 OAuth를 선택적으로 사용할 수 있습니다.
- 목록과 실행 시점 모두 `GOOGLE_DRIVE_FOLDER_ID`의 직접 하위 파일인지 확인합니다.
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

## 배포 개요

- 기존 포털 Netlify 사이트: 저장소 루트의 `netlify.toml`을 사용합니다.
- Runner Netlify 사이트: 같은 저장소를 두 번째 사이트로 연결하고 Package directory를 `runner`, Base directory는 비워 저장소 루트를 유지합니다. `runner/netlify.toml`이 적용되는지 Deploy log에서 확인합니다.
- 두 사이트에 필요한 환경변수를 각각 넣은 뒤 Runner를 먼저 배포하고, 확정된 Runner HTTPS origin을 포털의 `DRIVE_RUNNER_ORIGIN`에 등록해 포털을 다시 배포합니다.

Google Cloud API key 생성, Netlify 환경변수 입력, 두 사이트의 production deploy는 계정 소유자 권한이 필요한 수동 단계입니다. 현재처럼 공개 폴더를 사용하면 Google OAuth 동의는 필요하지 않습니다.
