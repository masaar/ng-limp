import { NgModule, ModuleWithProviders } from '@angular/core';

import { CookieModule } from 'ngx-cookie';

import { ApiService, CacheService } from './ng-limp.service';

@NgModule({
	declarations: [],
	imports: [ CookieModule.forRoot() ],
	exports: []
})
export class NgLimpModule {
	public static forRoot(): ModuleWithProviders {
		return {
			ngModule: NgLimpModule,
			providers: [
				CacheService,
				ApiService
			]
		};
	}
}