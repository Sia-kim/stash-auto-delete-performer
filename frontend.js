(function() {
    console.log("Auto Delete Plugin: v1.1.4 최종 로드됨");

    const TAG_NAME = "AutoDeleteTarget";
    const FLOAT_CONTAINER_ID = "auto-delete-float-container";

    async function gql(query, variables = {}) {
        const response = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        return response.json();
    }

    async function getOrCreateTag() {
        let res = await gql(`query { findTags(tag_filter: { name: { value: "${TAG_NAME}", modifier: EQUALS } }) { tags { id } } }`);
        if (res.data.findTags.tags.length > 0) return res.data.findTags.tags[0].id;
        res = await gql(`mutation { tagCreate(input: { name: "${TAG_NAME}" }) { id } }`);
        return res.data.tagCreate.id;
    }

    async function injectFloatingButtons() {
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        const existingContainer = document.getElementById(FLOAT_CONTAINER_ID);

        if (!match) {
            if (existingContainer) existingContainer.remove();
            return;
        }
        if (existingContainer) return;

        const performerId = match[1];
        const tagId = await getOrCreateTag();
        
        const res = await gql(`query { findPerformer(id: "${performerId}") { name tags { id } } }`);
        if (!res.data || !res.data.findPerformer) return;

        const performerName = res.data.findPerformer.name;
        const hasTag = res.data.findPerformer.tags.some(t => t.id === tagId);

        const container = document.createElement('div');
        container.id = FLOAT_CONTAINER_ID;
        container.style = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; background:rgba(30,30,30,0.95); padding:15px; border-radius:10px; border:1px solid #444; box-shadow: 0 4px 12px rgba(0,0,0,0.5); width: 220px;';

        // 1. 등록/해제 (빨강/회색)
        const regBtn = document.createElement('button');
        regBtn.style = 'width:100%;';
        const updateButtonState = (isRegistered) => {
            if (isRegistered) {
                regBtn.className = 'btn btn-secondary';
                regBtn.innerText = '🔓 자동 삭제 해제';
                regBtn.onclick = () => toggleTag(performerId, tagId, false, regBtn);
            } else {
                regBtn.className = 'btn btn-danger';
                regBtn.innerText = '🔒 자동 삭제 등록';
                regBtn.onclick = () => toggleTag(performerId, tagId, true, regBtn);
            }
            regBtn.disabled = false;
        };
        updateButtonState(hasTag);
        container.appendChild(regBtn);

        // 2. 목록 보기 (파랑)
        const mgmtBtn = document.createElement('button');
        mgmtBtn.className = 'btn btn-primary';
        mgmtBtn.style = 'width:100%;';
        mgmtBtn.innerText = '📋 삭제 대상 목록 보기';
        mgmtBtn.onclick = () => {
            window.location.href = `/tags/${tagId}/performers?sortby=name`;
        };
        container.appendChild(mgmtBtn);

        // 3. 기존 영상 일괄 삭제 (주황 테두리)
        const bulkBtn = document.createElement('button');
        bulkBtn.className = 'btn btn-outline-warning';
        bulkBtn.style = 'width:100%;';
        bulkBtn.innerText = '💣 기존 영상 일괄 삭제';
        bulkBtn.onclick = async () => {
            if (!confirm(`[경고] ${performerName} 배우의 '모든 기존 영상 파일'을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
            const checkStr = prompt(`정말로 삭제하려면 아래 칸에 배우 이름(${performerName})을 정확히 입력하세요.`);
            if (checkStr !== performerName) {
                alert("이름이 일치하지 않아 취소되었습니다.");
                return;
            }

            bulkBtn.innerText = '삭제 중...';
            bulkBtn.disabled = true;

            try {
                const scenesRes = await gql(`
                    query FindScenes($performerId: ID!) {
                        findScenes(scene_filter: { performers: { value: [$performerId], modifier: INCLUDES } }) {
                            scenes { id }
                        }
                    }
                `, { performerId: parseInt(performerId) });

                const sceneIds = scenesRes.data.findScenes.scenes.map(s => s.id);
                
                if (sceneIds.length === 0) {
                    alert("이 배우의 영상이 라이브러리에 없습니다.");
                    bulkBtn.innerText = '💣 기존 영상 일괄 삭제';
                    bulkBtn.disabled = false;
                    return;
                }

                await gql(`
                    mutation DestroyScenes($ids: [ID!]!) {
                        scenesDestroy(input: { ids: $ids, delete_file: true })
                    }
                `, { ids: sceneIds });

                alert(`${sceneIds.length}개의 영상이 성공적으로 삭제되었습니다.`);
                window.location.reload();
            } catch (e) {
                alert('오류 발생: ' + e.message);
                bulkBtn.innerText = '💣 기존 영상 일괄 삭제';
                bulkBtn.disabled = false;
            }
        };
        container.appendChild(bulkBtn);

        document.body.appendChild(container);
    }

    async function toggleTag(performerId, tagId, isAdd, btn) {
        if (!confirm(isAdd ? '이 배우의 영상을 자동으로 삭제하시겠습니까?' : '자동 삭제를 해제하시겠습니까?')) return;
        
        if (btn) { btn.innerText = '처리 중...'; btn.disabled = true; }

        try {
            const res = await gql(`query { findPerformer(id: "${performerId}") { tags { id } } }`);
            let currentTags = res.data.findPerformer.tags.map(t => t.id);

            if (isAdd && !currentTags.includes(tagId)) currentTags.push(tagId);
            if (!isAdd) currentTags = currentTags.filter(id => id !== tagId);

            await gql(`
                mutation UpdatePerformer($id: ID!, $tagId: [ID!]) {
                    performerUpdate(input: { id: $id, tag_ids: $tagId }) { id }
                }
            `, { id: performerId, tagId: currentTags });

            if (isAdd) {
                alert('자동 제거 대상으로 등록되었습니다.');
                if (btn) { btn.className = 'btn btn-secondary'; btn.innerText = '🔓 자동 삭제 해제'; btn.onclick = () => toggleTag(performerId, tagId, false, btn); btn.disabled = false; }
            } else {
                alert('자동 제거가 해제되었습니다.');
                if (btn) { btn.className = 'btn btn-danger'; btn.innerText = '🔒 자동 삭제 등록'; btn.onclick = () => toggleTag(performerId, tagId, true, btn); btn.disabled = false; }
            }
        } catch (e) {
            alert('오류 발생: ' + e.message);
            if (btn) { btn.innerText = isAdd ? '🔒 자동 삭제 등록' : '🔓 자동 삭제 해제'; btn.disabled = false; }
        }
    }

    let debounceTimer;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            injectFloatingButtons();
        }, 300); 
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
