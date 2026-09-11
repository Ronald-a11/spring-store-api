package com.codewithmosh.store.common;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.ForwardedHeaderFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Set;

// The proxy overwrites X-Forwarded-Proto, -Host and -For but passes other forwarded headers through from the client.
// This filter replaces the default ForwardedHeaderFilter and ignores those, so clients cannot spoof generated URLs.
@Configuration
@ConditionalOnProperty(value = "server.forward-headers-strategy", havingValue = "framework")
public class ForwardedHeadersConfig {

    /** Forwarded headers the proxy never sets, so they can only come from the client (lower case). */
    static final Set<String> UNTRUSTED_HEADERS = Set.of("forwarded", "x-forwarded-port", "x-forwarded-prefix", "x-forwarded-ssl");

    @Bean
    public FilterRegistrationBean<ForwardedHeaderFilter> forwardedHeaderFilter(ServerProperties serverProperties) {
        var filter = new TrustedForwardedHeaderFilter();
        // What Boot's Tomcat customizer would have applied to the stock filter (off by default).
        filter.setRelativeRedirects(serverProperties.getTomcat().isUseRelativeRedirects());
        var registration = new FilterRegistrationBean<ForwardedHeaderFilter>(filter);
        registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    static class TrustedForwardedHeaderFilter extends ForwardedHeaderFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
                throws ServletException, IOException {
            super.doFilterInternal(new UntrustedHeadersHiddenRequest(request), response, filterChain);
        }
    }

    /** Answers as if the untrusted forwarded headers were absent; everything else is delegated. */
    static class UntrustedHeadersHiddenRequest extends HttpServletRequestWrapper {
        UntrustedHeadersHiddenRequest(HttpServletRequest request) {
            super(request);
        }

        private static boolean hidden(String name) {
            return name != null && UNTRUSTED_HEADERS.contains(name.toLowerCase(Locale.ROOT));
        }

        @Override
        public String getHeader(String name) {
            return hidden(name) ? null : super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            return hidden(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            var names = super.getHeaderNames();
            if (names == null) return null;
            return Collections.enumeration(Collections.list(names).stream().filter(n -> !hidden(n)).toList());
        }
    }
}
