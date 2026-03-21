const PROJECTS_DATA = [
    {
        "id": "2026-03-21",
        "groupTitle": "부서관리권한 관리그룹 관련 프로토타입",
        "date": "2026-03-21",
        "description": "부서 관리자 권한, 관리 그룹, 항목 기반 관리, 백업 저장소 관련 화면 검토용 프로토타입입니다.",
        "items": [
            {
                "title": "공통 정책센터 — 그룹 기반 메뉴 통합",
                "description": "3개 화면(민감정보 패턴 관리 그룹 / 파일첨부 확장자 관리 그룹 / 예외 관리 그룹)을 공통 사이드바로 묶어 메뉴 전환으로 탐색하는 통합 프로토타입",
                "screens": [
                    "관리 그룹 목록 화면",
                    "관리 그룹 상세 및 적용 흐름",
                    "메뉴 유형별 접근 구조"
                ],
                "prototypeUrl": "./prototypes/20260321/admin-group-menu.html",
                "figmaUrl": "https://figma.com/design/1igehAViqcqYuJ5PI2nXLT/-기획-디자인-합본-OK5.0_Admin?node-id=38641-59411&t=ScE3ZSagdUgy69iR-4",
                "author": "박예은"
            },
            {
                "title": "사외 정책 IP 관리 — 부서관리자 항목 단위 접근 제어",
                "description": "전체 관리자는 모든 IP 항목을 편집 가능, 부서관리자는 소속 항목만 편집 가능하도록 항목 수준의 권한 분기를 시뮬레이션",
                "screens": [
                    "항목 기반 관리 메뉴",
                    "사외 정책 설정 화면",
                    "IP 조건 관리 흐름"
                ],
                "prototypeUrl": "./prototypes/20260321/admin-item-policy-ip.html",
                "figmaUrl": "https://figma.com/design/1igehAViqcqYuJ5PI2nXLT/-기획-디자인-합본-OK5.0_Admin?node-id=38641-59411&t=ScE3ZSagdUgy69iR-4",
                "author": "박예은"
            },
            {
                "title": "백업 저장소 관리 — 부서관리자 읽기 전용 처리",
                "description": "부서관리자로 전환 시 모든 설정 컨트롤이 비활성화되고 읽기 전용 배너·툴팁이 표시되는 권한 분기 케이스",
                "screens": [
                    "백업 저장소 목록 화면",
                    "읽기 전용 권한 노출 방식",
                    "조회 중심 접근 흐름"
                ],
                "prototypeUrl": "./prototypes/20260321/admin-readonly-backup.html",
                "figmaUrl": "https://figma.com/design/1igehAViqcqYuJ5PI2nXLT/-기획-디자인-합본-OK5.0_Admin?node-id=38641-59411&t=ScE3ZSagdUgy69iR-4",
                "author": "박예은"
            },
            {
                "title": "정책 템플릿 — 관리 그룹 적용 유형 비교",
                "description": "동일한 그룹 정책을 항목 ON/OFF 방식(유형 A)과 설정 리스트 방식(유형 B)으로 나눠 탭 전환으로 비교하는 프로토타입",
                "screens": [
                    "템플릿 정책 목록",
                    "정책 적용 대상 그룹 지정",
                    "적용 흐름 및 설정 구조 확인"
                ],
                "prototypeUrl": "./prototypes/20260321/template-group-policy-064.html",
                "figmaUrl": "https://figma.com/design/1igehAViqcqYuJ5PI2nXLT/-기획-디자인-합본-OK5.0_Admin?node-id=38641-59411&t=ScE3ZSagdUgy69iR-4",
                "author": "박예은"
            },
            {
                "title": "업무환경관리 대시보드",
                "description": "개요 지표(차단/경고), SW 라이선스·HW 자산 현황, 추이 차트, 랭킹으로 구성된 메인 대시보드. 데이터 있음/없음 케이스 전환 포함",
                "screens": [
                    "개요 지표 카드 (소프트웨어/웹사이트 차단·경고)",
                    "SW 라이선스 및 HW 자산 운영 현황",
                    "추이 차트 및 랭킹",
                    "Empty State 케이스"
                ],
                "prototypeUrl": "./prototypes/20260321/prototype_dashboard_v2.1.html",
                "figmaUrl": "https://www.figma.com/design/4nwGpwFcbYZ06kzfMxyPrS/-%EB%8F%84%EC%97%B0--%EC%9E%91%EC%97%85-%EA%B3%B5%EA%B0%84?node-id=2093-1833&t=BWuGRL9Fp8XXQsXN-1",
                "author": "이도연"
            }
        ]
    }
];