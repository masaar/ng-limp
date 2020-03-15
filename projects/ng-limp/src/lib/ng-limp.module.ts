import { NgModule, ModuleWithProviders } from '@angular/core';

import { CookieService } from 'ngx-cookie-service';

import { CacheService } from './cache.service'
import { ApiService } from './ng-limp.service';

@NgModule({
	declarations: [],
	imports: [],
	exports: [],
	providers: [
		CookieService,
		CacheService,
		ApiService
	]
})
export class NgLimpModule { }