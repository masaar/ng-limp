import { TestBed } from '@angular/core/testing';

import { NgLimpService } from './ng-limp.service';

describe('NgLimpService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: NgLimpService = TestBed.get(NgLimpService);
    expect(service).toBeTruthy();
  });
});
