// Frog Jumper 2D reads this balance and uses the same lock for every shop debit and reward.
const balanceKey='frogJumperWalletCoins';
const garageKey='frogRacingOwnedCarts';
const economyLock='frog-jumper-shop-economy';
export function walletSnapshot(){
  const value=Number(localStorage.getItem(balanceKey)??0);
  const saved=JSON.parse(localStorage.getItem(garageKey)??'[]');
  if(!Number.isSafeInteger(value)||value<0||!Array.isArray(saved))throw new Error('Unreadable wallet');
  return {balance:value,owned:new Set([0,...saved.filter(Number.isSafeInteger)])};
}
export function buyCart(id,price){
  return navigator.locks.request(economyLock,()=>{
    const {balance,owned}=walletSnapshot();
    if(owned.has(id))return true;
    if(balance<price)return false;
    const previous=JSON.stringify([...owned]);
    owned.add(id);
    localStorage.setItem(garageKey,JSON.stringify([...owned]));
    try{localStorage.setItem(balanceKey,String(balance-price));}
    catch(error){localStorage.setItem(garageKey,previous);throw error;}
    return true;
  });
}
export function earnCoins(amount){
  return navigator.locks.request(economyLock,()=>{
    const {balance}=walletSnapshot();
    localStorage.setItem(balanceKey,String(Math.min(Number.MAX_SAFE_INTEGER,balance+amount)));
  });
}
