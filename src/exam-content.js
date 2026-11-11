// Original practice material. Data only; exam-realism-spec.md is the requirement source.
export const examStages = [
  ['reception','受付',null],['desk','机上試験',300],['air','飛行空域及びその他の確認',180],
  ['preflight','作動前点検',720],['powered','作動点検',720],['flightcheck','飛行点検',720],['preRecord','日常点検記録の仕上げ',720],
  ['square','スクエア',480],['eight','8の字',480],['abnormal','異常事態',360],
  ['post','飛行後点検と飛行記録',300],['incident1','6-1 事故・重大インシデント',180],['incident2','6-2 発生時の措置',180],['result','模擬採点',null],
].map(([id,title,limit])=>({id,title,limit}));
export const examParts = [
  ['受付',['reception']],['机上',['desk']],['飛行前点検',['air','preflight','powered','flightcheck','preRecord']],
  ['実技',['square','eight','abnormal']],['飛行後',['post']],['事故報告',['incident1','incident2']],['結果',['result']],
].map(([title,stages])=>({title,stages}));
export const mockPlan = {place:'模擬試験場 第1区画',registration:'JA-TEST001',weather:'晴れ',documents:'登録情報・技能証明・機体の取扱説明書・必要な許可承認関係書類',description:'日中、目視内で立入管理した地上の試験区画を飛行します。第三者の立入りを監視し、機体の限界と当日の気象を照合します。許可承認の要否は、空域と方法を照合して飛行前に判断済みという設定です。',priorMinutes:120};
export const deskQuestions = [
  {id:'entry',prompt:'区画へ第三者が入ってきました。最初の対応は？',choices:['計画時間まで続ける','飛行の安全を確保して中断する','高度を上げて通過する','撮影だけ続ける'],answer:1},
  {id:'wind',prompt:'風が機体の運用限界を超える見込みです。どうしますか？',choices:['バッテリーを満充電にするだけ','機首だけ風上に向ける','延期や中止を含め計画を見直す','飛行時間だけ延ばす'],answer:2},
  {id:'battery',prompt:'計画の消費量では着陸時の余裕が不足します。適切なのは？',choices:['経路や時間を短縮し余裕を確保する','残量表示を消す','限界まで飛ぶ','高度だけ増やす'],answer:0},
  {id:'failsafe',prompt:'通信が失われた際の設定はいつ確認しますか？',choices:['通信が切れてから','記録作成のときだけ','確認は不要','飛行前に周囲の障害物と併せて確認する'],answer:3},
  {id:'damage',prompt:'点検でプロペラに亀裂がありました。どうしますか？',choices:['短時間なら飛行する','作動させず報告して対処する','飛行後に交換する','反対のプロペラも曲げる'],answer:1},
  {id:'route',prompt:'帰路に新しい障害物が見つかりました。適切なのは？',choices:['元の経路を必ず使う','速度を上げる','安全な経路と中止条件を再検討する','監視をやめる'],answer:2},
  {id:'health',prompt:'操縦中に強いめまいが出ました。どうしますか？',choices:['安全を確保し飛行を中止する','慣れるまで続ける','旋回を増やす','記録には残さない'],answer:0},
  {id:'log',prompt:'実施した飛行時間の記録に使うのは？',choices:['予定の開始と終了','充電時間','受付の時刻','実際の離陸と着陸の時刻'],answer:3},
  {id:'area',prompt:'空域の条件が計画から変わったと分かりました。どうしますか？',choices:['昨日の情報だけで飛ぶ','条件と必要な手続きを再確認する','低速なら確認不要','飛行後に調べる'],answer:1},
];
export const airQuestions = [
  {id:'law',prompt:'今回の飛行の法令・手続きと携帯書類について説明してください。',choices:[mockPlan.documents+'を確認し、空域と方法に応じた手続きを照合しました','書類も手続きも確認しません','資格があれば空域を調べません'],answer:0},
  {id:'health',prompt:'本日の体調を申告してください。',choices:['眠気や体調不良はありません。操縦に支障が出たら中止します','強い眠気がありますが続けます','申告しません'],answer:0},
  {id:'area',prompt:'飛行空域と周辺をどのように確認しましたか？',choices:['機体だけ確認しました','障害物、立入り、周辺と空域を確認し安全を確保しました','上空だけ見ました'],answer:1},
  {id:'weather',prompt:'天気と風速計を確認して気象を申告してください。',choices:['晴れ。表示された風の設定と現在の測定値を確認し、変化も監視します','無風と決めて確認しません','風速計は不要です'],answer:0},
];
export const inspectionItems = [
  {id:'body',label:'機体全般',stage:'preflight',observation:'ネジ・コネクタ・ケーブルの状態を確認。緩みや外れはありません。'},
  {id:'propeller',label:'プロペラ',stage:'preflight',observation:'各ブレードの表裏と縁を確認。亀裂、欠損、ゆがみはありません。'},
  {id:'frame',label:'フレーム',stage:'preflight',observation:'アームと接合部を確認。変形、損傷はありません。'},
  {id:'control',label:'操縦装置',stage:'preflight',observation:'外観、スティックの戻りとスイッチを確認。異常はありません。'},
  {id:'identification',label:'機体識別表示',stage:'preflight',observation:'識別票は固定されています。登録記号：JA-TEST001。'},
  {id:'power',label:'電源系統',stage:'powered',observation:'電源表示と接続に異常はありません。'},
  {id:'battery',label:'バッテリー・燃料',stage:'powered',observation:'機体と送信機の残量・固定・膨れを確認。正常です。'},
  {id:'remote',label:'リモートID',stage:'powered',observation:'この模擬機では正常作動を仮定して点呼します。'},
  {id:'communication',label:'通信系統',stage:'preRecord',observation:'飛行点検で通信が途切れず応答しました。'},
  {id:'propulsion',label:'推進系統',stage:'preRecord',observation:'飛行点検で異音・異常振動はありませんでした。'},
  {id:'automatic',label:'自動制御系統',stage:'preRecord',observation:'飛行点検で位置・高度の安定を確認しました。'},
  {id:'remarks',label:'特記事項（灯火・カメラ等）',stage:'powered',observation:'本練習の基本区分では灯火・カメラは非該当です。',result:'非該当'},
];
export const poweredQuestions = [
  {id:'mode',prompt:'スティックモードを点呼してください。',choices:['Mode 1','Mode 2：左が高度・旋回、右が前後・左右','未確認'],answer:1},
  {id:'batteryCall',prompt:'機体と送信機のバッテリーを点呼してください。',choices:['残量・固定・外観を確認し、飛行に必要な余裕があります','機体だけ見れば十分です','残量は確認しません'],answer:0},
  {id:'remoteCall',prompt:'本練習でのリモートIDの扱いを点呼してください。',choices:['非搭載なら確認を省略します','飛行後に確認します','この模擬機では正常作動を仮定して点呼します'],answer:2},
];
export const postItems = [
  {id:'mount',label:'機器の取付',observation:'取付部に緩みはありません。'}, {id:'exterior',label:'プロペラ・フレーム・識別票',observation:'損傷や脱落はありません。'},
  {id:'heat',label:'発熱',observation:'異常な発熱はありません。'}, {id:'debris',label:'ゴミの付着',observation:'異物の付着はありません。'},
];
export const calls = [
  {id:'takeoff',text:'周囲・上空・足元・気象を確認。推進系統を始動し、離陸します'},
  {id:'move',text:'指示を確認。移動を開始します'}, {id:'arrived',text:'指定の位置に到達し、停止しました'},
  {id:'land',text:'着陸地点と周囲を確認。着陸します'}, {id:'emergency',text:'緊急事態を確認。その場で停止します'},
];
export const examinerInstructions = {
  takeoff:'離陸を許可します。指定高度まで上がり、5秒間静止してください。',
  move:'次の区間を指示します。', land:'着陸地点上空で停止しました。安全を確認して着陸してください。',
  eight:'左側の円から入り、機首を進行方向に合わせて8の字を連続2周してください。',
  emergency:'緊急事態です。移動を止め、現在位置でホバリングしてください。',
  transit:'緊急着陸を指示します。高度を保ち、最短経路でH上空へ移動してください。',
  wait:'その位置で待機してください。次の指示を出します。',
};
export const incidentPrompt='無人航空機の事故に該当する事態を3つ選んで答えてください。';
export const incidentCases = [
  {id:'death',text:'人の死傷（重傷以上）',correct:true}, {id:'property',text:'第三者の物件の損壊',correct:true},
  {id:'aircraft',text:'航空機との衝突又は接触',correct:true},
  {id:'near',text:'航空機との衝突又は接触のおそれ（重大インシデント）',correct:false}, {id:'minor',text:'人の軽傷（重大インシデント）',correct:false},
  {id:'control',text:'飛行中に制御が一時できなくなった（重大インシデント）',correct:false},
];
export const incidentResponse = {prompt:'飛行で人が負傷しました。発生時に行う措置を選んでください。',choices:['撮影を続け、後日記録する','飛行を止めて周囲の安全を確保し、必要な救護・緊急通報、関係機関への報告と記録を行う','機体を回収することだけを優先する','報告せず帰宅する'],answer:1};
export const recordFields = [['date','飛行年月日'],['name','飛行させた者の氏名'],['overview','飛行概要'],['takeoffPlace','離陸場所'],['landingPlace','着陸場所'],['safety','飛行の安全に影響のあった事項'],['defects','不具合事項']];
export const unassessed = ['監視不足（カメラ画面の注視）','両手保持','不正行為','実機の転倒・損傷'];
