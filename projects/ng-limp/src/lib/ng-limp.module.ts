import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { CookieService } from 'ngx-cookie-service';

import { CacheService } from './cache.service'
import { ApiService } from './ng-limp.service';

@NgModule({
	declarations: [],
	imports: [
		HttpClientModule
	],
	exports: [],
	providers: [
		CookieService,
		CacheService,
		ApiService
	]
})
export class NgLimpModule { }