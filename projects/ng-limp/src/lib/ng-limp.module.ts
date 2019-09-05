import { NgModule, ModuleWithProviders } from '@angular/core';

import { CookieModule } from 'ngx-cookie';

import { CacheService } from './cache.service'
import { ApiService } from './ng-limp.service';

@NgModule({
	declarations: [],
	imports: [ CookieModule.forRoot() ],
	exports: [],
	providers: [
		CacheService,
		ApiService
	]
})
export class NgLimpModule { }