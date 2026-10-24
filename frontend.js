(function() {
    console.log("Auto Delete Plugin: v1.0.1 로드됨");

    const TAG_NAME = "AutoDeleteTarget";
    const BTN_ID = "btn-auto-delete-performer";

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

    function injectButton() {
        // 배우 상세 페이지인지 확인
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        if (!match) return;

        if (document.getElementById(BTN_ID)) return; // 이미 버튼이 있으면 패스

        // 화면에서 '삭제' 또는 'Delete' 버튼을 찾아 그 부모 요소를 컨테이너로 지정
        const allButtons = Array.from(document.querySelectorAll('button'));
        const deleteBtn = allButtons.find(b => b.innerText.includes('삭제') || b.innerText.includes('Delete'));
        
        let container = null;
        if (deleteBtn) {
            container = deleteBtn.parentElement; // 버튼 그룹
        } else {
            // 못 찾았을 경우를 대비한 백업 선택자
            container = document.querySelector('.details-edit .btn-group') || document.querySelector('.details-edit');
        }

        if (!container) {
            // console.log("Auto Delete: 컨테이너 대기 중...");
            return;
        }

        const performerId = match[1];
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.className = 'btn btn-danger';
        btn.innerText = '영상 자동 제거';
        btn.style.marginLeft = '10px';

        btn.onclick = async () => {
            if (!confirm('이 배우의 영상을 앞으로 스캔 시 자동으로 삭제하시겠습니까?')) return;
            btn.innerText = '처리 중...';
            try {
                const tagId = await getOrCreateTag();
                await gql(`
                    mutation UpdatePerformer($id: ID!, $tagId: [ID!]) {
                        performerUpdate(input: { id: $id, tag_ids: $tagId }) { id }
                    }
                `, { id: performerId, tagId: [tagId] });
                alert('자동 제거 대상으로 등록되었습니다.');
                btn.innerText = '등록 완료';
                btn.disabled = true;
            } catch (e) {
                alert('오류 발생: ' + e.message);
                btn.innerText = '영상 자동 제거';
            }
        };

        console.log("Auto Delete: 버튼 주입 완료!");
        container.appendChild(btn);
    }

    // SPA 라우팅 및 DOM 변경 감지
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 1초마다 한 번씩 강제로 확인 (안전장치)
    setInterval(injectButton, 1000);

})();
