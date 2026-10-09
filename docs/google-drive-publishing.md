# Google Drive 자동 게시 설정

## 1. 확정해야 할 운영 값

- 승인된 개인 Google Drive 게시 폴더 1개
- 기존 포털 Netlify 사이트
- HTML 실행 전용으로 새로 만들 Runner Netlify 사이트
- Google Drive API가 활성화된 Google Cloud 프로젝트와 API key

폴더 URL이 `https://drive.google.com/drive/folders/ABC123...`라면 `ABC123...` 부분이 `GOOGLE_DRIVE_FOLDER_ID`입니다. 포털의 `게시용 공간`은 이 승인 폴더이며 하위 폴더만 탐색합니다. 승인 폴더 바깥의 파일이나 폴더는 조회·실행 대상이 아닙니다. 바로가기는 대상이 승인 범위를 벗어날 수 있으므로 목록에서 제외합니다.

현재 게시 폴더 ID:

```text
1nvXxRHtqv9ibQN-mM46o-NVW_GdhTKq5
```

이 폴더는 비로그인 사용자에게도 HTML 파일 목록이 보이는 공개 뷰어 폴더로 확인되었습니다.

## 2. Google Cloud API key 준비

1. Google Cloud Console에서 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
2. Google Drive API를 활성화합니다.
3. **APIs & Services → Credentials → Create credentials → API key**를 선택합니다.
4. 생성된 key의 API restrictions를 **Google Drive API**로 제한합니다.
5. 이 key를 GitHub나 문서에 적지 말고 Netlify의 `GOOGLE_DRIVE_API_KEY` secret으로 저장합니다.

공개 폴더는 Google OAuth 로그인이나 refresh token 없이 API key로 목록을 조회할 수 있습니다. API key 자체에는 파일 수정·삭제 권한이 없습니다. 다만 무단 사용 방지를 위해 Google Drive API로 사용 범위를 제한하고 Netlify 서버에만 저장합니다.

참고: [Google Drive의 공개 폴더 목록 조회](https://developers.google.com/workspace/drive/api/guides/search-files#list_files_in_a_public_folder)

## 3. Runner 사이트 배포

포털·Runner의 `NODE_VERSION`은 로컬 검증과 동일한 24를 사용합니다. Netlify UI의 `AWS_LAMBDA_JS_RUNTIME` 재정의 값이 있다면 테스트 환경에서 `nodejs24.x`와 일치시키거나 기본 선택을 사용합니다. 운영 환경변수와 배포는 별도로 승인받습니다.

같은 GitHub 저장소를 Netlify의 두 번째 사이트로 연결합니다.

| 설정 | 값 |
| --- | --- |
| Base directory | 비움(저장소 루트) |
| Package directory | `runner` |
| Build command | 비움 |
| Publish directory | `runner/public` (`runner/netlify.toml` 기준 자동 적용) |
| Functions directory | `runner/netlify/functions` (`runner/netlify.toml` 기준 자동 적용) |

Runner 사이트에 다음 환경변수를 넣습니다.

```text
GOOGLE_DRIVE_API_KEY
GOOGLE_DRIVE_FOLDER_ID=1nvXxRHtqv9ibQN-mM46o-NVW_GdhTKq5
DRIVE_MAX_FILE_BYTES=20000000 # 선택, 최대 20 MB(decimal). 필요 시 낮춤
```

배포 후 `https://<runner-domain>/`에 Runner 안내 문장이 보이는지 확인합니다. 포털이 만드는 실제 파일 URL은 `/.netlify/functions/render?id=<DRIVE_FILE_ID>`입니다. 승인 폴더 밖의 ID는 403이어야 합니다.

로컬 개선안에서는 `render.mjs`와 `content.mjs`가 현대식 Request/Response API로 스트리밍합니다. 이전 `render.js`를 중복 배포하지 않습니다. `content`는 MD·TXT·래스터 이미지 전용이고 HTML은 거부합니다. 포털의 `/api/file-preview` 프록시는 Drive 키 없이 이 콘텐츠를 전달합니다. 모든 콘텐츠 조회에서 폴더 경계를 다시 검증합니다.

기존 `DRIVE_MAX_FILE_BYTES=5242880`이 남아 있으면 자동으로 20 MB로 올라가지 않습니다. 설정 변경·재배포는 별도 승인하에 수행합니다. 먼저 비운영 테스트 배포에서 경계 크기를 검증하고 실패하면 18 MB 또는 15 MB로 낮춥니다. [용량 검증 문서](file-size-review.md)를 확인하세요.

Netlify는 monorepo의 사이트별 `netlify.toml`을 찾을 때 Package directory를 우선 확인하며, Base directory를 비우면 저장소 루트에서 공통 서버 모듈을 묶을 수 있습니다. 참고: [Netlify monorepo 설정](https://docs.netlify.com/build/configure-builds/monorepos/)

### 같은 체크아웃에서 CLI 테스트 배포할 때

운영 배포를 바꾸지 않으려면 `--prod` 또는 `--prod-if-unlocked`를 사용하지 않습니다. CLI 27.12.0 기준 빌드는 기본으로 실행되며 `--context deploy-preview`와 `--no-build`를 함께 사용할 수 없습니다.

포털과 Runner를 연속 배포할 때는 `--skip-functions-cache`를 사용합니다. 이번 검증에서는 다른 함수 폴더를 지정해도 짧은 시간 안에 루트의 함수 manifest 캐시를 재사용해 Runner에 포털 함수가 올라가는 경우가 있었습니다. 배포 후 함수 목록에서 Runner는 `projects/content/render`, 포털은 `drive-projects/file-preview`인지 반드시 확인합니다.

```text
netlify deploy --site <RUNNER_SITE_ID> --filter runner --dir runner/public --functions runner/netlify/functions --skip-functions-cache --context deploy-preview --env DRIVE_MAX_FILE_BYTES=20000000 --env AWS_LAMBDA_JS_RUNTIME=nodejs24.x
netlify deploy --site <PORTAL_SITE_ID> --dir dist --functions netlify/functions --skip-functions-cache --context deploy-preview --env DRIVE_RUNNER_ORIGIN=https://<RUNNER_DRAFT_HOST> --env AWS_LAMBDA_JS_RUNTIME=nodejs24.x
```

`--env`의 값은 해당 테스트 배포에만 적용합니다. Google 키는 명령·문서에 넣지 않고 기존 Netlify secret을 사용합니다. Windows에서 `netlify api --data` JSON 인자가 손상되면 `.cmd` 래퍼 대신 설치된 공식 CLI의 JS 진입점을 `node`로 실행합니다. 테스트 후 두 사이트의 운영 `published_deploy.id`가 그대로인지 확인합니다. 참고: [공식 deploy CLI](https://cli.netlify.com/commands/deploy/).

## 4. 기존 포털 사이트 설정

기존 사이트는 저장소 루트의 `netlify.toml`을 사용합니다. 아래 환경변수를 설정합니다.

```text
DRIVE_RUNNER_ORIGIN=https://<runner-domain>
```

`DRIVE_RUNNER_ORIGIN`에는 끝의 `/`, 경로, 쿼리 문자열을 넣지 않습니다. 운영에서는 HTTPS만 허용합니다.
Drive API key와 폴더 ID는 Runner에만 저장합니다. 포털은 Runner의 검증된 목록 API만 호출하므로 Deploy Preview에 비밀키를 노출할 필요가 없습니다.

Netlify 환경변수는 저장소의 `netlify.toml`에 비밀값을 적는 방식이 아니라 Netlify UI/CLI/API로 등록해야 Function 런타임에서 안전하게 사용할 수 있습니다. 참고: [Netlify Functions 환경변수](https://docs.netlify.com/build/functions/environment-variables/)

## 5. 게시 및 검증

1. 자기 완결형 단일 HTML을 승인 폴더 또는 그 하위 폴더에 업로드합니다. 폴더 생성·파일 이동·업로드는 Google Drive에서 수행합니다.
2. Drive 상세정보에서 파일 MIME type이 HTML 계열인지 확인합니다.
3. 해당 폴더로 이동한 뒤 목록을 새로 고칩니다. 일반 목록 응답의 캐시는 60초이며 `목록 새로고침`은 캐시를 우회합니다. 파일명·게시 일시·소유자 이름과 제공되는 프로필 사진을 표시합니다. 게시 일시는 Drive의 `createdTime`을 한국 시간으로 변환한 값이며 폴더로 옮겨온 시간이 아닙니다.
4. 파일 행을 눌러 새 탭의 hostname이 Runner인지 확인합니다. Drive 파일용 중간 상세 페이지는 사용하지 않습니다.
5. 응답 헤더에 CSP sandbox와 `frame-ancestors 'none'`이 있는지 확인합니다.
6. 승인 폴더 밖 파일 ID, `.txt` 파일, 제한 크기 초과 파일이 각각 거부되는지 확인합니다.

파일을 Drive에서 교체하거나 이름을 바꾸면 다음 목록 갱신부터 반영됩니다. 게시용 공간 밖으로 이동하거나 휴지통으로 보내면 더 이상 목록/실행 대상이 아닙니다. 내부의 다른 폴더로 옮긴 파일은 새 폴더에서 볼 수 있으며 실행 링크를 다시 복사해야 합니다.

### 폴더 경로와 소유자

- `path`는 승인 폴더를 제외한 하위 폴더 ID의 `/` 연결 문자열입니다. 클라이언트가 보낸 경로를 신뢰하지 않고 승인 루트부터 각 폴더의 목록에서 다음 폴더 ID와 폴더 MIME type을 확인합니다. 공개 파일에서 부모 정보가 숨겨지는 경우에도 정확한 부모 조건의 Drive 목록 응답으로 관계를 확인합니다.
- 탐색한 폴더명으로 서버가 경로 표시를 만들고 포털로 전달합니다. HTML 실행 시에도 동일한 경로와 파일 허용 조건을 다시 확인합니다. 요청당 최대 100단계, 폴더당 최대 100페이지의 안전 제한이 있으며 초과·불완전 응답은 일부 목록으로 위장하지 않고 오류로 처리합니다.
- 공개 조회 방식에서는 하위 폴더와 파일도 공개 열람 가능해야 합니다. 폴더 URL을 아는 것만으로 비공개 항목에 접근할 수 없습니다.
- Drive `owners(displayName,photoLink,permissionId)`만 요청합니다. 이메일은 요청·전달하지 않습니다. 표시 이름과 HTTPS 사진을 전달하고 내부 식별자로 소유자 필터를 구분합니다. 사진이 없거나 로딩에 실패하면 이름 첫 글자, 소유자 전체가 없으면 `소유자 정보 없음`으로 대체합니다.
- 소유자는 업로더·작성자와 다를 수 있습니다. 조직의 공유 드라이브에는 개인 소유자 정보가 없을 수 있습니다. [Google 사용자 정보](https://developers.google.com/workspace/drive/api/reference/rest/v3/User), [파일 정보](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)를 참고하세요.
- 포털과 Runner는 계속 서로 다른 출처로 운영합니다. 로컬도 `4173`과 `4174`로 나누어 HTML 실행과 포털의 권한을 격리합니다. 파일 관리용 쓰기 권한이나 사용자 로그인은 추가하지 않습니다.

## 6. 장애 대응

| 증상 | 확인 항목 |
| --- | --- |
| Drive 그룹이 보이지 않음 | 포털의 `DRIVE_RUNNER_ORIGIN`, Runner Function log, API key·폴더 ID, Drive API 활성화 여부 |
| 그룹은 보이나 실행이 503 | Runner 환경변수와 재배포 여부 |
| 실행이 403 | 승인 폴더부터 파일 위치까지의 경로·공개 권한, 파일 이동 여부, 확장자, MIME type, 크기 제한 |
| Google API 403 | API key의 Drive API 활성화·API restriction·할당량 확인 |
| 외부 CSS/JS가 동작하지 않음 | HTTPS 주소인지, 실행 CSP가 허용하는 리소스인지, 단일 HTML로 인라인 가능한지 |

API key 교체 시 Runner 사이트의 secret만 갱신하고 재배포합니다. 사용을 중단할 때는 Google Cloud에서 key를 폐기하고 Netlify의 secret 환경변수를 삭제합니다.

## 7. 권한 소유자가 직접 해야 하는 단계

- Google Cloud 프로젝트에서 Drive API 활성화 및 API key 생성
- API key를 Google Drive API 전용으로 제한
- 게시용 Drive 폴더 선택과 회사 자료 승인 정책 확인
- Netlify Runner 사이트 생성, 환경변수 secret 등록, production deploy
- 기존 포털 production deploy 및 도메인/접근 정책 확인

현재 공개 폴더 구성에서는 OAuth 동의나 Google 로그인 연결이 필요하지 않습니다. 코드 변경과 자동 테스트만으로 Google Cloud key 생성 및 Netlify secret 입력 작업을 대신할 수는 없습니다.
