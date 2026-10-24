import sys
import json
import os
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

    # Stash 서버 연결 정보 (Docker 환경변수 기반)
    server_conn = {
        "scheme": os.environ.get("STASH_SCHEME", "http"),
        "host": os.environ.get("STASH_HOST", "localhost"),
        "port": os.environ.get("STASH_PORT", "9999"),
        "apikey": os.environ.get("STASH_API_KEY", "")
    }
    stash = StashInterface(server_conn)

    hook_context = data.get("args", {}).get("hookContext", {})
    if hook_context.get("type") != "Scene.Create.Post":
        return

    scene_id = hook_context.get("id")
    if not scene_id:
        return

    # 씬 정보 조회 (출연 배우 및 태그 확인)
    query = """
    query FindScene($id: ID!) {
        findScene(id: $id) {
            id
            title
            performers {
                id
                name
                tags { name }
            }
        }
    }
    """
    
    try:
        result = stash.graphql.query(query, {"id": scene_id})
        scene = result.get("findScene")
        if not scene:
            return

        # 삭제 대상 배우가 있는지 확인
        TARGET_TAG = "AutoDeleteTarget"
        should_delete = False
        deleted_performer_name = ""

        for performer in scene.get("performers", []):
            tags = [t["name"] for t in performer.get("tags", [])]
            if TARGET_TAG in tags:
                should_delete = True
                deleted_performer_name = performer.get("name")
                break

        if should_delete:
            log.info(f"자동 삭제 대상 배우({deleted_performer_name})가 포함된 씬 {scene_id}를 발견했습니다. 파일을 삭제합니다.")
            
            # 씬 및 실제 파일 삭제 (delete_file: true)
            destroy_mutation = """
            mutation DestroyScenes($ids: [ID!]!, $delete_file: Boolean!) {
                scenesDestroy(input: { ids: $ids, delete_file: $delete_file })
            }
            """
            stash.graphql.mutation(destroy_mutation, {
                "ids": [scene_id],
                "delete_file": True # 실제 비디오 파일 삭제
            })
            log.info(f"씬 {scene_id} 및 실제 파일 삭제 완료.")
            
    except Exception as e:
        log.error(f"Error processing scene {scene_id}: {e}")

if __name__ == "__main__":
    main()
