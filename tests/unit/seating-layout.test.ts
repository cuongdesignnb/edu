import {describe,it,expect} from 'vitest';
import {initialSeatingLayout,resizeSeating,moveStudent,sameSeating} from '@/features/class-org/seating-layout';
describe('seating edits preserve pupils and source snapshots',()=>{
 it('makes a valid empty stored revision editable instead of a zero-cell grid',()=>{const grid=initialSeatingLayout({rows:null,cols:null,seats:[]});expect(grid.rows).toBe(6);expect(grid.cols).toBe(6);expect(Object.keys(grid.seats)).toHaveLength(36);});
 it('swaps two pupils without duplicates and does not mutate the saved source',()=>{const source=initialSeatingLayout({rows:1,cols:2,seats:[{seat:'r1c1',studentId:'a'},{seat:'r1c2',studentId:'b'}]});const moved=moveStudent(source,'a','r1c2');expect(moved.seats).toEqual({r1c1:'b',r1c2:'a'});expect(source.seats).toEqual({r1c1:'a',r1c2:'b'});expect(moveStudent(moved,'a','outside')).toBe(moved);expect(moveStudent(moved,'a','r1c2')).toBe(moved);});
 it('releases the displaced pupil to the roster when assigning an unseated pupil',()=>{const source=initialSeatingLayout({rows:1,cols:1,seats:[{seat:'r1c1',studentId:'a'}]});expect(moveStudent(source,'b','r1c1').seats).toEqual({r1c1:'b'});expect(source.seats.r1c1).toBe('a');});
 it('shrinking keeps in-bounds seats and leaves the original available for undo',()=>{const source=initialSeatingLayout({rows:2,cols:2,seats:[{seat:'r1c1',studentId:'a'},{seat:'r2c2',studentId:'b'}]});const small=resizeSeating(source,1,2);expect(small.seats).toEqual({r1c1:'a',r1c2:null});expect(source.seats.r2c2).toBe('b');expect(sameSeating(source,small)).toBe(false);});
});
