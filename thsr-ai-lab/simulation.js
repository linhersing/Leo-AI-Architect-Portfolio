/* 展示用簡化模型；所有資料皆為自訂教學假設，非台灣高鐵官方資料 */
(()=>{"use strict";
const profiles={
 weekday:{label:"平日",factor:.74,supply:99,shape:[.58,.9,1.12,.95,.7,.62,.7,.65,.7,.72,.88,1.05,.92,.7,.62,.56,.43,.32]},
 weekend:{label:"假日",factor:.96,supply:102,shape:[.43,.58,.76,.93,1.09,1.12,.96,.91,.96,1.06,1.19,1.25,1.18,1.03,.88,.8,.62,.44]},
 holiday:{label:"連假",factor:1.20,supply:102,shape:[.57,.76,.96,1.2,1.30,1.18,1.10,1.16,1.28,1.41,1.48,1.44,1.33,1.25,1.17,1.02,.86,.62]}
};
const state={scenario:"weekend",demand:100,supply:100,playing:true};
const $=id=>document.getElementById(id);
const ns="http://www.w3.org/2000/svg";
function svgNode(tag,props,label){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(props))e.setAttribute(k,v);if(label!==undefined)e.textContent=label;return e}
function plot(demand,supply){const root=$("trend");root.replaceChildren();const x=i=>48+678*i/17;const y=v=>208-Math.max(0,Math.min(220,v))*176/220;
for(const n of [0,50,100,150,200]){root.append(svgNode("line",{x1:48,x2:726,y1:y(n),y2:y(n),class:"line"}));root.append(svgNode("text",{x:38,y:y(n)+4,"text-anchor":"end"},String(n)))}
[0,3,6,9,12,15,17].forEach(i=>root.append(svgNode("text",{x:x(i),y:234,"text-anchor":"middle"},String(i+6).padStart(2,"0")+":00")));
function line(values,className){root.append(svgNode("polyline",{class:className,points:values.map((v,i)=>x(i)+","+y(v)).join(" ")}))}
line(supply,"capacity");line(demand,"demand");
root.setAttribute("aria-label",profiles[state.scenario].label+"示範。旅客需求最高 "+Math.max(...demand).toFixed(0)+" 指數；運能最高 "+Math.max(...supply).toFixed(0)+" 指數。");
}
function showPeople(peak){const people=$("people");people.replaceChildren();const ratio=Math.min(1.0,Math.max(.06,peak/190));const active=Math.round(ratio*21);for(let i=0;i<21;i++){const d=document.createElement("span");d.className="person"+(i<active?" active":"")+(i>=15&&i<active?" overflow":"");d.setAttribute("aria-hidden","true");people.append(d)}$("crowdCaption").textContent=peak>140?"尖峰人潮較多":peak>100?"人潮偏多":"人潮相對分散";}
function update(){const p=profiles[state.scenario],ds=p.shape.map(n=>n*p.factor*100*state.demand/100),cs=p.shape.map((n,i)=>p.supply*state.supply/100*(i>=7&&i<=14?1.02:1));
let queue=0,maxQueue=0,high=0,peak=0;
for(let i=0;i<ds.length;i++){queue=Math.max(0,queue+ds[i]-cs[i]);maxQueue=Math.max(queue,maxQueue);peak=Math.max(peak,ds[i]/cs[i]);if(ds[i]/cs[i]>=.9)high++;}
$("peak").textContent=Math.round(peak*100)+"%";$("queue").textContent=maxQueue.toFixed(0);$("highHours").textContent=high+" / 18";
$("demandValue").textContent=state.demand+"%";$("supplyValue").textContent=state.supply+"%";$("currentScenario").textContent=p.label;
document.querySelectorAll("[data-scenario]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.scenario===state.scenario)));
const title=$("interpretTitle"),desc=$("interpret");
if(peak>1.05){title.textContent="部分時段可能出現排隊累積";desc.textContent="示範模型顯示需求超過服務運能。可展開「進階調整」提高運能、降低需求，觀察圖表如何改變。"}
else if(peak>=.90){title.textContent="尖峰需求接近運能";desc.textContent="這個情境顯示部分時段負載較高，調度研究需要同時考慮月台安全、站內人流和班距限制。"}
else{title.textContent="目前情境有較多緩衝";desc.textContent="示範模型中的需求低於服務運能，排隊指數較低。但不能直接推論真實高鐵的營運狀況。"}
showPeople(Math.max(...ds));plot(ds,cs);
const train=document.querySelector(".rail-train");if(train)train.style.animationDuration=(state.scenario==="holiday"?"6s":state.scenario==="weekend"?"9s":"12s");
}
document.querySelectorAll("[data-scenario]").forEach(b=>b.addEventListener("click",()=>{state.scenario=b.dataset.scenario;state.demand=100;state.supply=100;$("demandRange").value=100;$("supplyRange").value=100;update()}));
$("demandRange").addEventListener("input",e=>{state.demand=Number(e.target.value);update()});
$("supplyRange").addEventListener("input",e=>{state.supply=Number(e.target.value);update()});
$("reset").addEventListener("click",()=>{state.demand=100;state.supply=100;$("demandRange").value=100;$("supplyRange").value=100;update()});
$("toggleAnimation").addEventListener("click",()=>{state.playing=!state.playing;$("scene").classList.toggle("paused",!state.playing);$("toggleAnimation").textContent=state.playing?"暫停動畫":"播放動畫";$("toggleAnimation").setAttribute("aria-pressed",String(!state.playing))});
update();
})();