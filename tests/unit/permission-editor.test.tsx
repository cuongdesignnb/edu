// @vitest-environment jsdom
import {describe,it,expect,afterEach} from 'vitest';
import React,{act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {permissionCatalog,permissionPresets} from '../../src/lib/api/generated';
import {PermissionEditor} from '../../src/features/school-org/permission-editor';
import contract from '../../backend/src/generated/contract.json';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML='';});
async function mount(){const el=document.createElement('div');document.body.append(el);root=createRoot(el);function Form(){const [selected,setSelected]=useState(new Set<string>());return <PermissionEditor catalog={permissionCatalog.map(p=>({...p,key:p.action,canGrant:true}))} selected={selected} onChange={setSelected} disabled={false}/>;}await act(async()=>root.render(<Form/>));}
async function click(label:string){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label);expect(button).toBeTruthy();await act(async()=>button!.click());}
describe('full non-platform permission editor',()=>{
 it('renders exactly every non-platform contract action and only meaningful scope checkboxes',async()=>{await mount();expect([...document.querySelectorAll('[data-permission-action]')].map(e=>e.getAttribute('data-permission-action')).sort()).toEqual(contract.permissions.filter(a=>!a.startsWith('platform.')).sort());const settings=document.querySelector('[data-permission-action="school.settings"]')!;expect(settings.querySelectorAll('input[type=checkbox]').length).toBe(1);expect(settings.textContent).toContain('Trường');expect(settings.textContent).not.toContain('Lớp');expect(document.querySelector('[data-permission-action^="platform."]')).toBeNull();});
 it('supports search, group selection/removal and the complete GVCN preset',async()=>{await mount();await click('Chọn tất cả nhóm Học sinh');expect(document.querySelectorAll('input:checked').length).toBeGreaterThan(0);await click('Bỏ tất cả nhóm Học sinh');expect(document.querySelectorAll('input:checked').length).toBe(0);await click('GVCN đầy đủ');expect(document.querySelectorAll('input:checked').length).toBe(permissionPresets.find(p=>p.id==='homeroom-full')!.permissions.length);const input=document.querySelector('input:not([type=checkbox])') as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'sơ đồ');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(document.querySelectorAll('[data-permission-action]').length).toBe(1);expect(document.querySelector('[data-permission-action="seating.manage"]')).toBeTruthy();});
});
