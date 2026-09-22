# Google Drive 자동 게시 설정

## 1. 확정해야 할 운영 값

- 승인된 개인 Google Drive 게시 폴더 1개
- 기존 포털 Netlify 사이트
- HTML 실행 전용으로 새로 만들 Runner Netlify 사이트
- 한 번의 Google OAuth 동의를 수행할 Drive 계정

폴더 URL이 `https://drive.google.com/drive/folders/ABC123...`라면 `ABC123...` 부분이 `GOOGLE_DRIVE_FOLDER_ID`입니다. 하위 폴더는 탐색하지 않습니다. 게시자는 승인 폴더 바로 아래에 파일을 올려야 합니다.

## 2. Google Cloud와 OAuth 준비

1. Google Cloud Console에서 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
2. Google Drive API를 활성화합니다.
3. OAuth consent screen을 설정하고 게시 담당 Google 계정을 허용합니다.
4. OAuth client type을 Web application으로 생성합니다.
5. 다음 범위와 `access_type=offline`, `prompt=consent`를 사용하여 authorization code flow를 한 번 완료합니다.

```text
https://www.googleapis.com/auth/drive.readonly
```

이 범위는 수동 업로드된 파일의 본문까지 읽기 위해 필요합니다. `drive.file`은 앱이 생성했거나 사용자가 앱을 통해 선택한 파일 중심이라, Drive 폴더에 직접 업로드하는 이번 운영 방식에는 적합하지 않습니다. `drive.readonly`는 제한된 범위이므로 조직 외 다수 사용자에게 앱을 공개할 경우 Google의 검증 또는 보안 평가가 필요할 수 있습니다. 개인/제한 운영에서도 consent screen의 테스트 사용자, 앱 게시 상태, refresh token 만료 정책을 먼저 확인하세요.

발급받은 client ID, client secret, refresh token은 채팅·문서·GitHub issue에 남기지 말고 Netlify secret 환경변수로만 입력합니다. 토큰이 노출되면 Google 계정의 연결된 앱에서 즉시 철회하고 새로 발급합니다.

참고: [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive API scope 안내](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## 3. Runner 사이트 배포

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
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
GOOGLE_DRIVE_FOLDER_ID
DRIVE_MAX_FILE_BYTES        # 선택
```

배포 후 `https://<runner-domain>/`에 Runner 안내 문장이 보이는지 확인합니다. 실제 파일 URL은 `/view/<DRIVE_FILE_ID>`입니다. 승인 폴더 밖의 ID는 403이어야 합니다.

Netlify는 monorepo의 사이트별 `netlify.toml`을 찾을 때 Package directory를 우선 확인하며, Base directory를 비우면 저장소 루트에서 공통 서버 모듈을 묶을 수 있습니다. 참고: [Netlify monorepo 설정](https://docs.netlify.com/build/configure-builds/monorepos/)

## 4. 기존 포털 사이트 설정

기존 사이트는 저장소 루트의 `netlify.toml`을 사용합니다. 아래 환경변수를 설정합니다.

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
GOOGLE_DRIVE_FOLDER_ID
DRIVE_RUNNER_ORIGIN=https://<runner-domain>
DRIVE_MAX_FILE_BYTES        # 선택
```

`DRIVE_RUNNER_ORIGIN`에는 끝의 `/`, 경로, 쿼리 문자열을 넣지 않습니다. 운영에서는 HTTPS만 허용합니다.

Netlify 환경변수는 저장소의 `netlify.toml`에 비밀값을 적는 방식이 아니라 Netlify UI/CLI/API로 등록해야 Function 런타임에서 안전하게 사용할 수 있습니다. 참고: [Netlify Functions 환경변수](https://docs.netlify.com/build/functions/environment-variables/)

## 5. 게시 및 검증

1. 자기 완결형 단일 HTML을 승인 폴더 바로 아래에 업로드합니다.
2. Drive 상세정보에서 파일 MIME type이 HTML 계열인지 확인합니다.
3. 포털을 새로 고칩니다. 최대 60초 안에 `Google Drive 게시 프로토타입` 묶음과 파일 카드가 나타납니다.
4. `프로토타입 보기`를 눌러 새 탭의 hostname이 Runner인지 확인합니다.
5. 응답 헤더에 CSP sandbox와 `frame-ancestors 'none'`이 있는지 확인합니다.
6. 승인 폴더 밖 파일 ID, `.txt` 파일, 제한 크기 초과 파일이 각각 거부되는지 확인합니다.

파일을 Drive에서 교체하거나 이름을 바꾸면 다음 목록 갱신부터 반영됩니다. 파일을 폴더 밖으로 이동하거나 휴지통으로 보내면 더 이상 목록/실행 대상이 아닙니다.

## 6. 장애 대응

| 증상 | 확인 항목 |
| --- | --- |
| Drive 그룹이 보이지 않음 | 포털 Function log, 네 환경변수, Drive API 활성화, refresh token 상태 |
| 그룹은 보이나 실행이 503 | Runner 환경변수와 재배포 여부 |
| 실행이 403 | 파일의 직접 부모 폴더, 확장자, MIME type, 크기 제한 |
| `invalid_grant` | refresh token 철회/만료 여부, OAuth 앱 게시 상태, 테스트 사용자 |
| 외부 CSS/JS가 동작하지 않음 | HTTPS 주소인지, 실행 CSP가 허용하는 리소스인지, 단일 HTML로 인라인 가능한지 |

토큰 교체 시 포털과 Runner 두 사이트를 모두 갱신하고 재배포합니다. 사용을 중단할 때는 Google 계정에서 OAuth 권한을 철회하고 Netlify의 secret 환경변수를 삭제합니다.

## 7. 권한 소유자가 직접 해야 하는 단계

- Google Cloud 프로젝트/consent screen/OAuth client 생성
- `drive.readonly` 동의 및 refresh token 발급
- 게시용 Drive 폴더 선택과 회사 자료 승인 정책 확인
- Netlify Runner 사이트 생성, 환경변수 secret 등록, production deploy
- 기존 포털 production deploy 및 도메인/접근 정책 확인

코드 변경과 자동 테스트만으로 위 계정 권한 작업을 대신할 수는 없습니다.
