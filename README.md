<div align="center">

# 🗑️ Stash Auto Delete Banned Performer

**특정 배우의 영상을 자동으로 감지하여 실제 파일까지 영구 삭제하는 Stash 플러그인**

[![Stash](https://img.shields.io/badge/Stash-v24%2B-blue?style=for-the-badge&logo=stash)](https://stashapp.cc)
[![Version](https://img.shields.io/badge/version-1.2.6-success?style=for-the-badge)](https://github.com/Sia-kim/stash-auto-delete-performer)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-yellow?style=for-the-badge&logo=python)](https://www.python.org)

[설치 방법](#-설치-방법) • [시놀로지 연동](#-시놀로지-스케줄러-연동-필수) • [버전 기록](#-버전-기록-changelog)

</div>

---

## 📖 소개
`AutoDeleteTarget` 태그가 부여된 배우가 출연하는 영상을 **스캔 완료 후 안전하게 감지**하여, Stash 라이브러리와 실제 하드디스크에서 영구 삭제합니다. 50개 단위 분할 삭제, 철저한 사전 조회 검증, 외부 스케줄러 연동을 통해 대규모 라이브러리에서도 안정적으로 동작합니다.

> **📸 플로팅 UI 미리보기**
> *(배우 상세 페이지 우측 하단에 생성되는 제어판 스크린샷을 여기에 추가하세요)*

## ✨ 주요 기능
| 기능 | 설명 |
|---|---|
| **플로팅 UI** | 배우 페이지에서 클릭 한 번으로 등록/해제 및 수동 삭제 가능 |
| **자동 삭제** | `AutoDeleteTarget` 태그가 달린 배우의 영상을 50개씩 분할 삭제 |
| **철저한 안전장치** | 조회 실패, Job Queue 이상, 개수 불일치 시 **즉시 중단** |
| **외부 스케줄러** | 브라우저 타이머 없이 시놀로지 작업 스케줄러 등으로 백그라운드 실행 |

## 🚀 설치 방법
1. Stash 웹 UI에서 **설정(Settings) → 플러그인(Plugins)** 으로 이동합니다.
2. **패키지 소스 추가(Add Source)** 를 클릭합니다.
3. 아래 주소를 입력합니다. (캐시 방지를 위해 `?v=26` 포함)
   ```text
   https://sia-kim.github.io/stash-auto-delete-performer/index.yml?v=26
업데이트 확인 후 1.2.6 버전을 설치합니다.

<details> <summary><b>📋 상세 설치 가이드 (클릭하여 펼치기)</b></summary>
GitHub 저장소의 plugin.yml, backend.py, frontend.js 3개 파일만 ZIP으로 압축합니다.

ZIP 파일의 SHA256 해시를 계산하여 index.yml의 sha256 항목에 반영합니다.

Stash 설정에서 패키지 소스를 등록할 때, 위 설치 주소를 사용합니다.

설치 완료 후 Ctrl + F5 (강력 새로고침)을 눌러 UI를 갱신합니다.

</details>
⚙️ 시놀로지 스케줄러 연동 (필수)
Stash 웹 UI가 꺼져 있어도 매일 정해진 시간에 스캔과 삭제를 순차적으로 실행하려면 시놀로지 작업 스케줄러를 사용하세요.

시놀로지 DSM → 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트

일반 탭: 작업 이름 Stash Auto Delete, 사용자 root

일정 탭: 매일, 오전 5:00 (스캔 시작 전)

작업 설정 탭: 아래 스크립트를 붙여넣기 (IP, 포트, API 키 수정 필수)

<details> <summary><b>📜 시놀로지 Bash 스크립트 (클릭하여 펼치기)</b></summary>
bash
#!/bin/bash
# 👇 본인의 Stash 환경에 맞게 IP와 API 키를 수정하세요.
STASH_URL="http://127.0.0.1:9999/graphql"
API_KEY="YOUR_STASH_API_KEY"

# 1. 스캔 작업 시작
SCAN_RESPONSE=$(curl -fsS -X POST "$STASH_URL" \
  -H "ApiKey: $API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query":"mutation { metadataScan(input: {}) }"}')

SCAN_JOB_ID=$(printf '%s' "$SCAN_RESPONSE" | jq -er '.data.metadataScan')
if [ -z "$SCAN_JOB_ID" ] || [ "$SCAN_JOB_ID" = "null" ]; then
  echo "스캔 작업 시작 실패: $SCAN_RESPONSE" >&2
  exit 1
fi
echo "스캔 작업 시작됨. Job ID: $SCAN_JOB_ID"

# 2. 스캔 완료(FINISHED) 대기 (최대 1시간)
MAX_WAIT=3600
WAITED=0
SCAN_FINISHED=false

while [ $WAITED -lt $MAX_WAIT ]; do
  JOB_RESPONSE=$(curl -fsS -X POST "$STASH_URL" \
    -H "ApiKey: $API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"query\":\"query { findJob(input: { id: \\\"$SCAN_JOB_ID\\\" }) { status } }\"}")
  
  JOB_STATUS=$(printf '%s' "$JOB_RESPONSE" | jq -er '.data.findJob.status')
  
  if [ "$JOB_STATUS" = "FINISHED" ]; then
    SCAN_FINISHED=true
    echo "스캔 작업이 정상 완료되었습니다."
    break
  elif [ "$JOB_STATUS" = "FAILED" ] || [ "$JOB_STATUS" = "CANCELLED" ]; then
    echo "스캔 실패/취소. 삭제를 중단합니다. 상태: $JOB_STATUS" >&2
    exit 1
  fi
  
  echo "스캔 진행 중... (${WAITED}초 경과, 상태: $JOB_STATUS)"
  sleep 10
  WAITED=$((WAITED + 10))
done

if [ "$SCAN_FINISHED" = false ]; then
  echo "스캔 시간 초과. 삭제를 중단합니다." >&2
  exit 1
fi

# 3. 스캔 완료 후 삭제 태스크 실행
DELETE_RESPONSE=$(curl -fsS -X POST "$STASH_URL" \
  -H "ApiKey: $API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query":"mutation { runPluginTask(plugin_id: \"stash-auto-delete-performer\", task_name: \"Auto Delete Banned Scenes\", description: \"Auto Delete Banned Scenes\") }"}')

if ! printf '%s' "$DELETE_RESPONSE" | jq -e '((.errors // []) | length == 0) and (.data.runPluginTask | type == "string" and length > 0)' >/dev/null; then
  echo "삭제 태스크 등록 실패: $DELETE_RESPONSE" >&2
  exit 1
fi

DELETE_JOB_ID=$(printf '%s' "$DELETE_RESPONSE" | jq -er '.data.runPluginTask')
echo "삭제 태스크 등록 완료. Job ID: $DELETE_JOB_ID"
참고: 시놀로지에 jq 패키지가 설치되어 있어야 합니다. (패키지 센터에서 설치)

</details>
⚠️ 주의사항
실제 파일 영구 삭제: 이 플러그인은 delete_file: true 옵션을 사용하여 하드디스크의 비디오 파일을 영구 삭제합니다.

백업 필수: 처음 사용하실 때는 반드시 백업된 테스트 라이브러리에서 충분히 검증하시길 강력히 권장합니다.

권한: Stash 컨테이너가 영상 폴더에 대해 읽기/쓰기 권한을 가지고 있어야 합니다.

📜 버전 기록 (Changelog)
<details> <summary><b>전체 버전 기록 보기 (클릭)</b></summary>
v1.2.6 (최종): 시놀로지 스크립트에 metadataScan 및 findJob을 연동하여 스캔 완료 후에만 삭제가 실행되도록 순차 제어 완벽 구현. Job Queue Null 안전 처리 및 명시적 Description 전달.

v1.2.5: Job Queue 응답 구조 철저 검증, Job ID 반환 확인(jq), 프런트엔드 중복 검사 강화.

v1.2.4: 스캔 확인 실패 시 삭제 중단, 전체 대상 사전 검증 로직 추가.

v1.2.3: 수동 실행 오류 처리 버그 수정, Job Queue 중복 검사 강화.

v1.2.2: 브라우저 타이머(setInterval) 제거, 외부 스케줄러 연동 모드로 전환.

v1.2.0: 스케줄러 방식 도입, 플러그인 설정(schedule_time) 추가.

v1.1.9: injectPending 대기열 추가로 SPA 버튼 누락/중복 생성 버그 해결.

v1.1.0 ~ v1.1.8: 일괄 삭제 기능 추가, 안전장치 도입, 플로팅 UI 개선 및 수많은 예외 처리 버그 수정.

v1.0.0: 최초 배포.

</details>
