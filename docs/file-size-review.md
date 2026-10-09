# 스트리밍 및 미리보기 검증

확인일: 2026-10-10. 로컬 검증과 Netlify 비운영 테스트 배포 결과이다. 실제 Google Drive의 15~20 MB 파일에 대한 운영 안정성 검증은 아직 아니다.

## 구현한 동작

| 대상 | 직접 실행/미리보기 상한 | 초과 시 |
| --- | --- | --- |
| HTML 새 탭 실행 | 기본 20,000,000 byte (20 MB decimal) | 목록에 남고 용량 초과 안내, Drive 열람 |
| PNG/JPEG/GIF/WebP/AVIF/BMP | HTML과 같은 제한 | 목록에 남고 Drive 열람 |
| MD/TXT/LOG 모달 | 2,000,000 byte (2 MB decimal) | 목록에 남고 Drive 열람 |
| Office/PDF/Google 문서/기타 | 포털 직접 렌더링하지 않음 | Drive에서 열기 |

`DRIVE_MAX_FILE_BYTES`는 Runner의 HTML·이미지 상한을 1~20,000,000 byte로 설정한다. 예전 `5242880`이 남아 있으면 5 MiB 제한이 계속 적용된다. MD/TXT는 별도 고정 제한이다. SVG는 직접 미리보기를 하지 않는다. 바로가기는 목록에서 제외한다.

전체 `.text()` 읽기와 Lambda 응답 객체 대신 현대식 `Response(ReadableStream)`을 사용한다. 전체 수신 전에 첫 bytes를 보내고 backpressure를 유지한다. 승인 폴더 메타데이터로 사전 크기를 검사하고 실제 스트림의 byte 상한과 완료 크기를 다시 검사한다. 클라이언트 취소와 55초 내부 제한을 Drive 요청 및 reader 취소로 전달한다. 중간 실패는 연결 오류로 처리하며 이미 실행된 HTML을 되돌리거나 새 오류 문구를 임의로 덧붙이지 않는다.

포털 프록시는 허용 이미지 MIME와 `text/plain`만 전달한다. MD는 DOMPurify로 정제하며 외부 이미지·스타일·폼·SVG·iframe·스크립트를 막고 상대 경로를 자동 해석하지 않는다. 모달 닫기 시 요청과 Blob URL을 정리한다.

## 공식 상한

- [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/): 일반 응답 6 MB, 스트리밍 20 MB.
- [현대식 Functions API](https://docs.netlify.com/build/functions/api/#streaming-responses): 스트리밍 60초.
- [Lambda 호환 stream 래퍼](https://docs.netlify.com/build/functions/lambda-compatibility/): 10초. 이번 구현은 이 래퍼를 사용하지 않는다.

공식 문서는 MB로 표기하며 정확한 byte 경계는 실환경에서 확인해야 한다. 구현은 보수적으로 decimal 20 MB를 사용한다. 이는 함수 응답 제한이지 Drive 업로드나 정적 호스팅 전체 한계가 아니다.

## 로컬 결과

- 5/10/15/18/20 MB의 정확한 byte 수와 SHA-256 일치. 한국어 UTF-8, 큰따옴표, 역슬래시가 포함된 bytes를 그대로 전달한다.
- upstream 종료 전에 첫 chunk 수신. 초과 메타데이터는 다운로드 전에 413이며 목록에서는 사라지지 않는다.
- 전송 중 상한 초과, 크기 불일치, upstream 오류, 취소와 timeout을 검사한다.
- 승인 범위 밖 ID/폴더, 잘못된 요청, HTML의 포털 미리보기 접근, 허용되지 않은 MIME를 거부한다.
- MD 정제, 모달 닫기·포커스 복귀, 문서/원문 전환, 늦은 응답 무시, Blob URL 해제, 오류 안내를 자동 테스트한다.
- 브라우저에서 MD·이미지 미리보기와 20 MB 예시 HTML의 마지막 `전송 완료` 표시를 확인했다.

가상 Drive 응답과 로컬 HTTP 서버 기준이다. 실제 Drive의 속도, Netlify 응답 경계, 동시 접속, 운영 크레딧 차이는 측정하지 않았다. 로컬 성공만으로 운영 안정성을 보장할 수 없다.

## 사용자 승인 후 실환경 검증

1. 운영 포털을 건드리지 않는 Runner·포털 테스트 배포를 만든다. 허용된 파일을 읽기만 하고 키는 서버에만 둔다. 새 인증·권한 확대는 하지 않는다.
2. 기존 실제 HTML과 승인된 5/10/15/18/20 MB 파일을 같은 조건에서 반복 확인한다. 테스트 파일 업로드가 필요하면 사용자 승인 후 테스트 폴더에서 수행한다.
3. HTTP 상태, 첫 응답/전체 전송 시간, 내용 일치, 실행, 콜드 스타트, 느린 네트워크와 동시 접속을 확인한다. 실제 파일과 합성 경계 테스트를 함께 사용한다.
4. 20 MB에서 실패하면 18 MB, 이후 15 MB로 낮춰 재검증한다. 실행 시간 문제는 용량과 구분한다.
5. 크레딧 사용과 최종 운영 상한을 확인하고 실배포를 승인받는다.

## 비운영 Netlify 결과 (2026-10-10)

- 포털 테스트: `https://6ac9179b28a7aca95cd04734--okplan.netlify.app`
- 실제 Drive 연결 Runner: `https://6ac916e5769320d35ca44085--okplan-runner.netlify.app`
- 별도 합성 경계 검사: Runner draft `6ac918a1abc97afcea516c48`의 테스트 전용 함수. 실제 Drive 요청·키를 사용하지 않고 동일한 `file-response`와 `boundedStream`에 고정 합성 upstream을 주입했다. 운영 함수·포털에는 포함하지 않았다.
- 모든 배포는 `deploy-preview`이며 `published_at`이 비어 있다. 현대식 함수의 Netlify 배포 메타데이터에서 `im=stream`, 런타임 `nodejs24.x`를 확인했다.
- 실제 루트 목록: 파일 8개와 폴더 1개. 하위 폴더 목록: HTML 1개. 가장 큰 실제 HTML 4,322,043 byte를 HTTP 200으로 끝까지 수신했고 포털 클릭으로 독립된 Runner 탭에서 열어 내부 페이지 전환을 확인했다.
- 잘못된 ID 400, 경로 없이 하위 파일 조회 403, 올바른 경로 포함 조회 200, HTML의 포털 미리보기 접근 415를 확인했다. 실제 HTML 응답에 sandbox(allow-same-origin 없음), COOP, no-store를 확인했다.

| 합성 HTML | 받은 byte 수 | 전체 검사 시간 | 결과 |
| --- | ---: | ---: | --- |
| 5 MB | 5,000,000 | 2.15초 | SHA-256·끝 표시 일치 |
| 10 MB | 10,000,000 | 1.25초 | SHA-256·끝 표시 일치 |
| 15 MB | 15,000,000 | 1.19초 | SHA-256·끝 표시 일치 |
| 18 MB | 18,000,000 | 1.68초 | SHA-256·끝 표시 일치 |
| 20 MB | 20,000,000 | 1.52초 | SHA-256·끝 표시 일치 |
| 20 MB 반복 | 20,000,000 | 1.76초 | 동일 SHA-256·끝 표시 일치 |
| 21 MB | 본문 전송 전 차단 | — | 애플리케이션 제한 413 |

시간은 이 PC·당시 네트워크에서 합성 데이터를 수신·검사한 값이며 Drive 지연을 포함하지 않는다. 실제 파일의 예상 속도나 SLA로 사용할 수 없다. 21 MB는 우리 사전 제한 검사 결과이며 Netlify 자체 상한을 넘겨 본 결과가 아니다.

운영 포털 배포 ID `6abe86088be9bf0008a9d8bc`, 운영 Runner 배포 ID `6abe85c03576c100085c4bc1`은 테스트 전후 동일했다. 운영 환경변수 변경·커밋·푸시·Drive 쓰기는 하지 않았다.

현재 승인 폴더에는 MD/TXT/이미지 및 15~20 MB 실제 파일이 없어 그 파일들의 실환경 end-to-end 검증은 남아 있다. 로컬 미리보기/자동 테스트와 합성 Netlify 경계 테스트를 실제 Drive 대용량 검증으로 혼동하지 않는다. 사용자 승인 게시 파일을 올린 후 동일 테스트 주소에서 확인하고 최종 운영 배포 여부를 결정한다.
