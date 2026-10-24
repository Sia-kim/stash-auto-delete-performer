(function() {
    console.log("Auto Delete Plugin: v1.2.6 최종 안전화 버전");

    const TAG_NAME = "AutoDeleteTarget";
    const FLOAT_CONTAINER_ID = "auto-delete-float-container";
    const TASK_DESC = "Auto Delete Banned Scenes";
    
    let isInjecting = false; 
    let injectPending = false;

    async function gql(query, variables = {}) {
        try {
            const response = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, variables })
            });
            const json = await response.json();
            if (json.errors) throw new Error(json.errors.map(e => e.message).join(', '));
            return json.data;
        } catch (error) {
            console.error("GraphQL Error:", error);
            throw error;
        }
    }

    async function triggerDeleteTask() {
        try {
            const queueRes = await gql(`query { jobQueue { id status description } }`);
            
            if (!queueRes || !Array.isArray(queueRes.jobQueue)) {
                throw new Error("Job Queue 응답을 확인할 수 없습니다. 안전을 위해 실행을 차단합니다.");
            }

            const activeStatuses = new Set(["READY", "RUNNING", "STOPPING"]);
            const isAlreadyRunning = queueRes.jobQueue.some(
                job => activeStatuses.has(job.status) && (job.description || "").includes(TASK_DESC)
            );

            if (isAlreadyRunning) {
                alert("이미 삭제 태스크가 실행 중이거나 대기 중입니다. Stash 작업 큐를 확인해주세요.");
                return false;
            }

            const res = await gql(`
                mutation { 
                    runPluginTask(
                        plugin_id: "stash-auto-delete-performer", 
                        task_name: "Auto Delete Banned Scenes",
                        description: "${TASK_DESC}"
                    ) 
                }
            `);
            
            if (!res || !res.runPluginTask) {
                throw new Error("태스크 ID를 받지 못했습니다.");
            }
            
            console.log("태스크 작업 ID:", res.runPluginTask);
            return true;
            
        } catch (e) {
            console.error("태스크 실행 실패:", e);
            alert("자동 삭제 태스크 실행에 실패했습니다: " + e.message);
            return false;
        }
    }

    async function getOrCreateTag() {
        const res = await gql(`query { findTags(tag_filter: { name: { value: "${TAG_NAME}", modifier: EQUALS } }) { tags { id } } }`);
        if (res.findTags.tags.length > 0) return res.findTags.tags[0].id;
        const createRes = await gql(`mutation { tagCreate(input: { name: "${TAG_NAME}" }) { id } }`);
        return createRes.tagCreate.id;
    }

    async function injectFloatingButtons() {
        if (isInjecting) {
            injectPending = true;
            return;
        }
        
        const match = window.location.pathname.match(/^\/performers\/(\d+)/);
        let existingContainer = document.getElementById(FLOAT_CONTAINER_ID);

        if (!match) {
            if (existingContainer) existingContainer.remove();
            return;
        }

        const performerId = match[1];

        if (existingContainer) {
            if (existingContainer.dataset.performerId === performerId) return;
            existingContainer.remove();
        }

        isInjecting = true;

        try {
            const tagId = await getOrCreateTag();
            const res = await gql(`query { findPerformer(id: "${performerId}") { name tags { id } } }`);
            
            const currentMatch = window.location.pathname.match(/^\/performers\/(\d+)/);
            if (!currentMatch || currentMatch[1] !== performerId) return; 

            if (!res || !res.findPerformer) return;

            const performerName = res.findPerformer.name;
            const hasTag = res.findPerformer.tags.some(t => t.id === tagId);

            if (document.getElementById(FLOAT_CONTAINER_ID)) return;

            const container = document.createElement('div');
            container.id = FLOAT_CONTAINER_ID;
            container.dataset.performerId = performerId;
            container.style = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; background:rgba(30,30,30,0.95); padding:15px; border-radius:10px; border:1px solid #444; box-shadow: 0 4px 12px rgba(0,0,0,0.5); width: 220px;';

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

            const mgmtBtn = document.createElement('button');
            mgmtBtn.className = 'btn btn-primary';
            mgmtBtn.style = 'width:100%;';
            mgmtBtn.innerText = '📋 삭제 대상 목록 보기';
            mgmtBtn.onclick = () => {
                window.location.href = `/tags/${tagId}/performers?sortby=name`;
            };
            container.appendChild(mgmtBtn);

            const bulkBtn = document.createElement('button');
            bulkBtn.className = 'btn btn-outline-warning';
            bulkBtn.style = 'width:100%;';
            bulkBtn.innerText = '⚡ 지금 즉시 일괄 삭제';
            
            bulkBtn.onclick = async () => {
                if (!confirm(`[경고] ${performerName} 배우를 포함한 '모든 등록 대상 배우'의 영상을 지금 즉시 삭제하시겠습니까?`)) return;
                
                bulkBtn.innerText = '실행 중...';
                bulkBtn.disabled = true;

                try {
                    const started = await triggerDeleteTask();
                    if (started) {
                        alert("삭제 태스크가 백그라운드에서 시작되었습니다. Stash 작업 큐와 로그를 확인해주세요.");
                    }
                } finally {
                    bulkBtn.innerText = '⚡ 지금 즉시 일괄 삭제';
                    bulkBtn.disabled = false;
                }
            };
            container.appendChild(bulkBtn);

            document.body.appendChild(container);
        } catch (error) {
            console.error("Failed to inject floating buttons:", error);
        } finally {
            isInjecting = false;
            if (injectPending) {
                injectPending = false;
                setTimeout(() => { injectFloatingButtons(); }, 0);
            }
        }
    }

    async function toggleTag(performerId, tagId, isAdd, btn) {
        if (!confirm(isAdd ? '이 배우의 영상을 자동으로 삭제하시겠습니까?' : '자동 삭제를 해제하시겠습니까?')) return;
        if (btn) { btn.innerText = '처리 중...'; btn.disabled = true; }

        try {
            const res = await gql(`query { findPerformer(id: "${performerId}") { tags { id } } }`);
            let currentTags = res.findPerformer.tags.map(t => t.id);

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFloatingButtons);
    } else {
        injectFloatingButtons();
    }

    let debounceTimer;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { injectFloatingButtons(); }, 300); 
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
