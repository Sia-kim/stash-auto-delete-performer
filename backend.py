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
        log.error("No server_connection found in hook context.")
        return
        
    try:
        stash = StashInterface(server_conn)
        stash.RAISE_GQL_ERRORS = True
    except Exception as e:
        log.error(f"Failed to connect to Stash: {e}")
        return

    hook_context = data.get("args", {}).get("hookContext", {})
    if hook_context.get("type") != "Scene.Create.Post":
        return

    scene_id = hook_context.get("id")
    if not scene_id:
        return

    query = """
    query FindScene($id: ID!) {
        findScene(id: $id) {
            id
            performers {
                id
                name
                tags { name }
            }
        }
    }
    """
    
    try:
        result = stash.call_GQL(query, {"id": scene_id})
        scene = result.get("findScene") if result else None
        if not scene:
            log.warning(f"씬 {scene_id} 조회 결과가 없습니다.")
            return

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
            
            destroy_mutation = """
            mutation DestroyScenes($ids: [ID!]!, $delete_file: Boolean!, $delete_generated: Boolean!) {
                scenesDestroy(input: { ids: $ids, delete_file: $delete_file, delete_generated: $delete_generated })
            }
            """
            del_res = stash.call_GQL(destroy_mutation, {
                "ids": [scene_id], 
                "delete_file": True,
                "delete_generated": True
            })
            
            if not del_res or del_res.get("scenesDestroy") is not True:
                log.error(f"씬 {scene_id} 삭제 결과 확인 실패: {del_res}")
            else:
                log.info(f"씬 {scene_id} 및 실제 파일 삭제 완료.")
            
    except Exception as e:
        log.error(f"Error processing scene {scene_id}: {e}")

if __name__ == "__main__":
    main()
