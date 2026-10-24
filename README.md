# Stash Auto Delete Banned Performer

스캔된 영상에 특정 배우가 포함되어 있을 경우, 비디오 파일과 DB 레코드를 자동으로 삭제하는 Stash 플러그인입니다.

## 설치 방법
1. Stash 웹 UI에서 `Settings` > `Plugins`로 이동합니다.
2. `Available Plugins` 탭에서 `Add Source`를 클릭합니다.
3. 본 리포지토리의 GitHub URL을 입력합니다. (예: `https://github.com/사용자이름/stash-auto-delete-performer`)
4. `Reload`를 누르고 목록에 나타나면 설치합니다.

## 사용 방법
1. Stash에서 삭제하고 싶은 배우의 상세 페이지로 이동합니다.
2. 하단 버튼 영역의 **[영상 자동 제거]** 버튼을 클릭합니다.
3. 앞으로 토렌트 등을 통해 이 배우가 포함된 영상이 스캔되면, 즉시 파일이 삭제됩니다.

## ⚠️ 주의사항
- `delete_file: true` 옵션이 작동하므로 **실제 비디오 파일이 영구 삭제**됩니다.
- Stash 컨테이너가 비디오 파일이 있는 디렉토리에 대해 **읽기/쓰기 권한**을 가지고 있어야 정상적으로 파일이 삭제됩니다.
