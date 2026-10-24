import sys
import json
import stashapi.log as log
from stashapi.stashapp import StashInterface

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            return
        data = json.loads(raw_input)
    except Exception as e:
        log.error(f"Failed to parse input: {e}")
        return

    server_conn = data.get("server_connection") or data.get("args", {}).get("server_connection")
    if not server_conn:
        log.error("No server_connection found.")
        return

    try:
        stash = StashInterface(server_conn)
        stash.RAISE_GQL_ERRORS = True
    except Exception as e:
        log.error(f"Failed to connect to Stash: {e}")
        return

    log.info("Auto-delete task started. (Scan completion guaranteed by external scheduler)")

    # 1. AutoDeleteTarget 태그 ID 조회
    tag_query = """query { findTags(tag_filter: { name: { value: "AutoDeleteTarget", modifier: EQUALS } }) { tags { id } } }"""
    try:
        tag_res = stash.call_GQL(tag_query)
        if not isinstance(tag_res, dict) or "findTags" not in tag_res:
            log.error("태그 조회 응답이 유효하지 않습니다. 삭제를 중단합니다.")
            return
        tags = tag_res["findTags"].get("tags", [])
        if not tags:
            log.info("AutoDeleteTarget 태그가 없습니다. 태스크를 종료합니다.")
            return
        tag_id = tags[0]["id"]
    except Exception as e:
        log.error(f"Failed to find tag: {e}")
        return

    # 2. 해당 태그가 달린 배우 목록 전체 조회
    perf_query = """
    query FindPerformers($tagId: ID!) {
        findPerformers(
            performer_filter: { tags: { value: [$tagId], modifier: INCLUDES } },
            filter: { per_page: -1 }
        ) {
            count
            performers { id name }
        }
    }
    """
    try:
        perf_res = stash.call_GQL(perf_query, {"tagId": tag_id})
        if not isinstance(perf_res, dict) or "findPerformers" not in perf_res:
            log.error("배우 조회 응답이 유효하지 않습니다. 삭제를 중단합니다.")
            return
            
        perf_data = perf_res["findPerformers"]
        if not isinstance(perf_data.get("performers"), list) or not isinstance(perf_data.get("count"), int):
            log.error("배우 조회 응답 형식이 잘못되었습니다. 삭제를 중단합니다.")
            return

        performers = perf_data["performers"]
        total_performers = perf_data["count"]

        if total_performers != len(performers):
            log.error(f"Performer count mismatch: expected {total_performers}, got {len(performers)}. Aborting.")
            return
    except Exception as e:
        log.error(f"Failed to fetch performers: {e}")
        return

    if not performers:
        log.info("자동 삭제 대상 배우가 없습니다.")
        return

    # 3. 모든 배우의 씬 ID를 먼저 사전 조회 및 검증 (하나라도 실패 시 중단)
    all_scene_ids = []
    for perf in performers:
        pid = perf["id"]
        pname = perf["name"]
        
        scenes_query = """
        query FindScenes($performerId: ID!) {
            findScenes(
                scene_filter: { performers: { value: [$performerId], modifier: INCLUDES } },
                filter: { per_page: -1 }
            ) {
                count
                scenes { id }
            }
        }
        """
        try:
            s_res = stash.call_GQL(scenes_query, {"performerId": pid})
            
            if not isinstance(s_res, dict) or "findScenes" not in s_res:
                log.error(f"{pname}: 씬 조회 응답이 없습니다. 삭제를 중단합니다.")
                return
                
            scene_data = s_res["findScenes"]
            if not isinstance(scene_data.get("scenes"), list) or not isinstance(scene_data.get("count"), int):
                log.error(f"{pname}: 씬 조회 응답 형식이 잘못되었습니다. 삭제를 중단합니다.")
                return
                
            scene_ids = [s["id"] for s in scene_data["scenes"]]
            
            if scene_data["count"] != len(scene_ids):
                log.error(f"{pname}: 씬 개수 불일치. 삭제를 중단합니다.")
                return
            
            all_scene_ids.extend(scene_ids)
        except Exception as e:
            log.error(f"Failed to fetch scenes for {pname}: {e}. Aborting for safety.")
            return

    # 4. 수집된 모든 씬 ID를 중복 제거 후 50개씩 분할 삭제
    unique_scene_ids = list(set(all_scene_ids))
    log.info(f"Total unique scenes to delete: {len(unique_scene_ids)}")

    if not unique_scene_ids:
        log.info("삭제할 씬이 없습니다.")
        return

    total_deleted = 0
    failed_chunks = 0
    chunk_size = 50

    for i in range(0, len(unique_scene_ids), chunk_size):
        chunk = unique_scene_ids[i:i + chunk_size]
        destroy_mutation = """
        mutation DestroyScenes($ids: [ID!]!) {
            scenesDestroy(input: { ids: $ids, delete_file: true, delete_generated: true })
        }
        """
        try:
            del_res = stash.call_GQL(destroy_mutation, {"ids": chunk})
            if del_res.get("scenesDestroy") is True:
                total_deleted += len(chunk)
                log.info(f"Deleted {len(chunk)} scenes (progress: {total_deleted}/{len(unique_scene_ids)})")
            else:
                failed_chunks += 1
                log.error(f"Delete response error for chunk: {del_res}")
        except Exception as e:
            failed_chunks += 1
            log.error(f"Delete failed for chunk: {e}")

    # 5. 최종 결과 로깅
    if failed_chunks > 0:
        log.warning(f"Auto-delete task completed with {failed_chunks} failed chunks. Total deleted: {total_deleted}")
    else:
        log.info(f"Auto-delete task finished successfully. Total deleted: {total_deleted}")

if __name__ == "__main__":
    main()
