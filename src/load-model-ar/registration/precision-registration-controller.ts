import {
	createDefaultPrecisionRegistrationState,
	type RegistrationStore
} from '../data/registration-store.js';

interface CreatePrecisionRegistrationControllerOptions {
	store: RegistrationStore;
	setStatus(message: string): void;
}

export interface PrecisionRegistrationController {
	handleSourceSelection(sourcePoint: string): void;
	armSourcePoint(): void;
	confirmTargetPoint(): void;
	addPair(): void;
	solve(): void;
	save(): void;
	clear(): void;
	updateSourcePointOptions(sourcePoints: string[]): void;
}

export function createPrecisionRegistrationController(
	options: CreatePrecisionRegistrationControllerOptions
): PrecisionRegistrationController {

	const { store, setStatus } = options;

	return {
		handleSourceSelection(sourcePoint) {

			store.patch( {
				precisionRegistration: {
					...store.getState().precisionRegistration,
					selectedSourcePoint: sourcePoint
				}
			} );

		},

		armSourcePoint() {

			const precisionState = store.getState().precisionRegistration;
			if ( precisionState.selectedSourcePoint.length === 0 ) {
				setStatus( '请先选择一个模型控制点。' );
				return;
			}

			store.patch( {
				precisionRegistration: {
					...precisionState,
					stagedSourcePoint: precisionState.selectedSourcePoint,
					workflowStatusText: `已锁定模型控制点 ${precisionState.selectedSourcePoint}，等待确认现实对应点。`
				}
			} );
			setStatus( `已选择模型控制点 ${precisionState.selectedSourcePoint}。` );

		},

		confirmTargetPoint() {

			const precisionState = store.getState().precisionRegistration;
			if ( precisionState.stagedSourcePoint === '未选择' ) {
				setStatus( '请先锁定一个模型控制点。' );
				return;
			}

			const targetLabel = `现实点 P${precisionState.pairSummaries.length + 1}`;
			store.patch( {
				precisionRegistration: {
					...precisionState,
					stagedTargetPoint: targetLabel,
					workflowStatusText: `已确认 ${targetLabel}，现在可以把这组点对加入求解列表。`
				}
			} );
			setStatus( `已确认 ${targetLabel}。` );

		},

		addPair() {

			const precisionState = store.getState().precisionRegistration;
			if ( precisionState.stagedSourcePoint === '未选择' || precisionState.stagedTargetPoint === '未确认' ) {
				setStatus( '请先准备好模型点和现实点。' );
				return;
			}

			const nextPairCount = precisionState.pairSummaries.length + 1;
			const nextSummary = `${nextPairCount}. ${precisionState.stagedSourcePoint} -> ${precisionState.stagedTargetPoint}`;

			store.patch( {
				precisionRegistration: {
					...precisionState,
					pairSummaries: [ ...precisionState.pairSummaries, nextSummary ],
					stagedSourcePoint: '未选择',
					stagedTargetPoint: '未确认',
					workflowStatusText: nextPairCount >= 4
						? '控制点数量已满足精配准求解的 UI 条件，可以进入重新求解。'
						: `已添加第 ${nextPairCount} 组点对，建议继续采集到 4 组以上。`
				}
			} );
			setStatus( `已添加第 ${nextPairCount} 组控制点对。` );

		},

		solve() {

			const precisionState = store.getState().precisionRegistration;
			if ( precisionState.pairSummaries.length < 3 ) {
				setStatus( '至少需要 3 组控制点才能开始求解。' );
				return;
			}

			store.patch( {
				precisionRegistration: {
					...precisionState,
					rmsText: '待接入求解器',
					workflowStatusText: '精配准求解 UI 已打通，下一步可接 sourcePoints / targetPoints 求 deltaTransform。'
				}
			} );
			setStatus( '精配准求解入口已准备，待接入实际算法。' );

		},

		save() {

			const precisionState = store.getState().precisionRegistration;
			if ( precisionState.pairSummaries.length < 4 ) {
				setStatus( '建议至少采集 4 组控制点后再保存精配准结果。' );
				return;
			}

			setStatus( '精配准保存入口已准备，待接入最终结果持久化。' );

		},

		clear() {

			store.patch( {
				precisionRegistration: {
					...createDefaultPrecisionRegistrationState(),
					availableSourcePoints: store.getState().precisionRegistration.availableSourcePoints
				}
			} );
			setStatus( '已清空精配准点对草稿。' );

		},

		updateSourcePointOptions(sourcePoints) {

			store.patch( {
				precisionRegistration: {
					...store.getState().precisionRegistration,
					availableSourcePoints: sourcePoints,
					selectedSourcePoint: sourcePoints[ 0 ] ?? ''
				}
			} );

		}
	};

}
