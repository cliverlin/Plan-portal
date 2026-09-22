# Google Drive 자동 게시 설정

## 1. 확정해야 할 운영 값

- 승인된 개인 Google Drive 게시 폴더 1개
- 기존 포털 Netlify 사이트
- HTML 실행 전용으로 새로 만들 Runner Netlify 사이트
- Google Drive API가 활성화된 Google Cloud 프로젝트와 API key

폴더 URL이 `https://drive.google.com/drive/folders/ABC123...`라면 `ABC123...` 부분이 `GOOGLE_DRIVE_FOLDER_ID`입니다. 하위 폴더는 탐색하지 않습니다. 게시자는 승인 폴더 바로 아래에 파일을 올려야 합니다.

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
DRIVE_MAX_FILE_BYTES        # 선택
```

배포 후 `https://<runner-domain>/`에 Runner 안내 문장이 보이는지 확인합니다. 포털이 만드는 실제 파일 URL은 `/.netlify/functions/render?id=<DRIVE_FILE_ID>`입니다. 승인 폴더 밖의 ID는 403이어야 합니다.

Netlify는 monorepo의 사이트별 `netlify.toml`을 찾을 때 Package directory를 우선 확인하며, Base directory를 비우면 저장소 루트에서 공통 서버 모듈을 묶을 수 있습니다. 참고: [Netlify monorepo 설정](https://docs.netlify.com/build/configure-builds/monorepos/)

## 4. 기존 포털 사이트 설정

기존 사이트는 저장소 루트의 `netlify.toml`을 사용합니다. 아래 환경변수를 설정합니다.

```text
DRIVE_RUNNER_ORIGIN=https://<runner-domain>
```

`DRIVE_RUNNER_ORIGIN`에는 끝의 `/`, 경로, 쿼리 문자열을 넣지 않습니다. 운영에서는 HTTPS만 허용합니다.
Drive API key와 폴더 ID는 Runner에만 저장합니다. 포털은 Runner의 검증된 목록 API만 호출하므로 Deploy Preview에 비밀키를 노출할 필요가 없습니다.

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
| Drive 그룹이 보이지 않음 | 포털의 `DRIVE_RUNNER_ORIGIN`, Runner Function log, API key·폴더 ID, Drive API 활성화 여부 |
| 그룹은 보이나 실행이 503 | Runner 환경변수와 재배포 여부 |
| 실행이 403 | 파일의 직접 부모 폴더, 확장자, MIME type, 크기 제한 |
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
