// Native details remain usable without JavaScript. Deep links reveal a study,
// including the older access-specific anchors preserved inside each entry.
function revealLinkedStudy(){
  let id;
  try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
  const study=document.getElementById(id)?.closest('details.research-project');
  if(!study)return;
  study.open=true;
  requestAnimationFrame(()=>study.scrollIntoView({block:'start'}));
}
window.addEventListener('hashchange',revealLinkedStudy);
revealLinkedStudy();

// Print the complete agenda, then restore the reader's disclosure choices.
let printState=null;
window.addEventListener('beforeprint',()=>{
  if(printState)return;
  printState=new Map([...document.querySelectorAll('.research-project, .editorial-note')].map(study=>[study,study.open]));
  for(const study of printState.keys())study.open=true;
});
window.addEventListener('afterprint',()=>{
  if(!printState)return;
  for(const [study,open] of printState)study.open=open;
  printState=null;
});
