import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NgLimpComponent } from './ng-limp.component';

describe('NgLimpComponent', () => {
  let component: NgLimpComponent;
  let fixture: ComponentFixture<NgLimpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NgLimpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NgLimpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
