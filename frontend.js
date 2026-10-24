(function() {
    console.log("Auto Delete Plugin: v1.0.4 로드됨");

    const TAG_NAME = "AutoDeleteTarget";
    const BTN_ID = "btn-auto-delete-performer";
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

    // 배우 상세 페이지에 등록/해제 버튼 주입
    async function injectPerformerButton() {
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        if (!match) return;
        if (document.getElementById(BTN_ID)) return;

        const performerId = match[1];
        const allButtons = Array.from(document.querySelectorAll('button'));
        const deleteBtn = allButtons.find(b => b.innerText.includes('삭제') || b.innerText.includes('Delete'));
        
        let container = deleteBtn ? deleteBtn.parentElement : document.querySelector('.details-edit');
        if (!container) return;

        const tagId = await getOrCreateTag();
        const res = await gql(`query { findPerformer(id: "${performerId}") { tags { id } } }`);
        const hasTag = res.data.findPerformer.tags.some(t => t.id === tagId);

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
    }

    // 태그 추가/제거
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

    // 상단 메뉴에 '삭제 대상 보기' 버튼 주입 (필터링된 배우 탭으로 이동)
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
        
        // 🔥 클릭 시 AutoDeleteTarget 태그로 필터링된 배우 탭으로 이동
        btn.onclick = () => {
            window.location.href = '/performers?q=tag%3A%22AutoDeleteTarget%22';
        };
        
        li.appendChild(btn);
        navbar.insertBefore(li, navbar.firstChild);
    }

    setInterval(() => {
        injectPerformerButton();
        injectManagerButton();
    }, 1000);
})();
