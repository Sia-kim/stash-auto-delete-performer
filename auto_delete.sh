#!/bin/bash
STASH_URL="http://서버주소/graphql"
API_KEY="api_키입력"

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

# 3. 스캔 완료 후 삭제 태스크 실행 (수정된 부분: plugin_id 사용)
DELETE_RESPONSE=$(curl -fsS -X POST "$STASH_URL" \
  -H "ApiKey: $API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"query":"mutation { runPluginTask(plugin_id: \"plugin\", task_name: \"Auto Delete Banned Scenes\", description: \"Auto Delete Banned Scenes\") }"}')

if ! printf '%s' "$DELETE_RESPONSE" | jq -e '((.errors // []) | length == 0) and (.data.runPluginTask | type == "string" and length > 0)' >/dev/null; then
  echo "삭제 태스크 등록 실패: $DELETE_RESPONSE" >&2
  exit 1
fi

DELETE_JOB_ID=$(printf '%s' "$DELETE_RESPONSE" | jq -er '.data.runPluginTask')
echo "삭제 태스크 등록 완료. Job ID: $DELETE_JOB_ID"