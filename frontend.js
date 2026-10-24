(function() {
    console.log("Auto Delete Plugin: v1.1.0 로드됨");

    const TAG_NAME = "AutoDeleteTarget";
    const BTN_ID = "btn-auto-delete-performer";
    const BULK_BTN_ID = "btn-bulk-delete-performer";
    const MGMT_BTN_ID = "btn-auto-delete-manager";

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

    async function injectPerformerButtons() {
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        if (!match) return;
        if (document.getElementById(BTN_ID)) return;

        const performerId = match[1];
        const allButtons = Array.from(document.querySelectorAll('button'));
        const deleteBtn = allButtons.find(b => b.innerText.includes('삭제') || b.innerText.includes('Delete'));
        
        let container = deleteBtn ? deleteBtn.parentElement : document.querySelector('.details-edit');
        if (!container) return;

        const tagId = await getOrCreateTag();
        const res = await gql(`query { findPerformer(id: "${performerId}") { name tags { id } } }`);
        const performerName = res.data.findPerformer.name;
        const hasTag = res.data.findPerformer.tags.some(t => t.id === tagId);

        // 1. 등록/해제 버튼
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.style.marginLeft = '10px';

        const updateButtonState = (isRegistered) => {
            if (isRegistered) {
                btn.className = 'btn btn-secondary';
                btn.innerText = '등록 해제';
                btn.onclick = () => toggleTag(performerId, tagId, false);
            } else {
                btn.className = 'btn btn-danger';
                btn.innerText = '영상 자동 제거';
                btn.onclick = () => toggleTag(performerId, tagId, true);
            }
            btn.disabled = false;
        };
        updateButtonState(hasTag);
        container.appendChild(btn);

        // 2. [NEW] 기존 영상 일괄 삭제 버튼
        const bulkBtn = document.createElement('button');
        bulkBtn.id = BULK_BTN_ID;
        bulkBtn.className = 'btn btn-outline-danger';
        bulkBtn.style.marginLeft = '10px';
        bulkBtn.innerText = '💣 기존 영상 일괄 삭제';
        
        bulkBtn.onclick = async () => {
            // 이중 확인 절차
            if (!confirm(`[경고] ${performerName} 배우의 '모든 기존 영상 파일'을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
            const checkStr = prompt(`정말로 삭제하려면 아래 칸에 배우 이름(${performerName})을 정확히 입력하세요.`);
            if (checkStr !== performerName) {
                alert("이름이 일치하지 않아 취소되었습니다.");
                return;
            }

            bulkBtn.innerText = '삭제 중...';
            bulkBtn.disabled = true;

            try {
                // 1. 배우의 모든 씬 ID 가져오기
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

                // 2. 씬 및 파일 일괄 삭제 (delete_file: true)
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
    }

    async function toggleTag(performerId, tagId, isAdd) {
        if (!confirm(isAdd ? '이 배우의 영상을 자동으로 삭제하시겠습니까?' : '자동 삭제를 해제하시겠습니까?')) return;
        
        const btn = document.getElementById(BTN_ID);
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
                if (btn) { btn.className = 'btn btn-secondary'; btn.innerText = '등록 해제'; btn.onclick = () => toggleTag(performerId, tagId, false); btn.disabled = false; }
            } else {
                alert('자동 제거가 해제되었습니다.');
                if (btn) { btn.className = 'btn btn-danger'; btn.innerText = '영상 자동 제거'; btn.onclick = () => toggleTag(performerId, tagId, true); btn.disabled = false; }
            }
        } catch (e) {
            alert('오류 발생: ' + e.message);
            if (btn) { btn.innerText = isAdd ? '영상 자동 제거' : '등록 해제'; btn.disabled = false; }
        }
    }

    function injectManagerButton() {
        if (document.getElementById(MGMT_BTN_ID)) return;
        const navbar = document.querySelector('.navbar-nav.ml-auto') || document.querySelector('.navbar-collapse');
        if (!navbar) return;

        const li = document.createElement('li');
        li.className = 'nav-item';
        const btn = document.createElement('button');
        btn.id = MGMT_BTN_ID;
        btn.className = 'btn btn-sm btn-outline-danger ml-2';
        btn.style.marginTop = '5px';
        btn.innerText = '🗑️ 삭제 대상 보기';
        
        btn.onclick = () => {
            window.location.href = '/performers?q=tag%3A%22AutoDeleteTarget%22';
        };
        
        li.appendChild(btn);
        navbar.insertBefore(li, navbar.firstChild);
    }

    setInterval(() => {
        injectPerformerButtons();
        injectManagerButton();
    }, 1000);
})();
