(function() {
    const TAG_NAME = "AutoDeleteTarget";
    const BTN_ID = "btn-auto-delete-performer";

    // GraphQL 요청을 위한 헬퍼 함수
    async function gql(query, variables = {}) {
        const response = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        return response.json();
    }

    // 태그 찾기 또는 생성
    async function getOrCreateTag() {
        let res = await gql(`query { findTags(tag_filter: { name: { value: "${TAG_NAME}", modifier: EQUALS } }) { tags { id } } }`);
        if (res.data.findTags.tags.length > 0) return res.data.findTags.tags[0].id;

        // 태그가 없으면 생성
        res = await gql(`mutation { tagCreate(input: { name: "${TAG_NAME}" }) { id } }`);
        return res.data.tagCreate.id;
    }

    // MutationObserver로 페이지 로드 감지
    const observer = new MutationObserver(async (mutations, obs) => {
        // 배우 상세 페이지의 버튼 컨테이너 찾기 (.details-edit 또는 하단 버튼 그룹)
        const editButtons = document.querySelector('.details-edit .btn-group');
        if (!editButtons || document.getElementById(BTN_ID)) return;

        // 현재 URL에서 배우 ID 추출 (/performers/599 -> 599)
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        if (!match) return;
        const performerId = match[1];

        // 버튼 생성
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.className = 'btn btn-danger'; // 기존 삭제 버튼과 동일한 스타일
        btn.innerText = '영상 자동 제거';
        btn.style.marginLeft = '10px';

        btn.onclick = async () => {
            if (!confirm('이 배우의 영상을 앞으로 스캔 시 자동으로 삭제하시겠습니까?')) return;
            
            btn.innerText = '처리 중...';
            try {
                const tagId = await getOrCreateTag();
                // 배우에게 태그 부여 (기존 태그 유지를 위해 performerUpdate 사용)
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

        // 기존 버튼 그룹 우측에 추가
        editButtons.appendChild(btn);
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
